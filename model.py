"""
TRIDENT — Tiny 3-Head Language Model
Heads: Code | Math | Research
~1M parameters | portable | trains on CPU
"""

import torch, torch.nn as nn, torch.nn.functional as F, math


class TridentConfig:
    vocab_size  = 4096
    max_seq_len = 256
    d_model     = 128
    n_heads     = 4
    n_layers    = 4
    d_ff        = 512
    dropout     = 0.1
    head_layers = 1
    head_d_ff   = 256
    rag_top_k   = 3
    rag_dim     = 128
    heads       = ['code', 'math', 'research']


class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=512, dropout=0.1):
        super().__init__()
        self.drop = nn.Dropout(dropout)
        pe  = torch.zeros(max_len, d_model)
        pos = torch.arange(max_len).unsqueeze(1).float()
        div = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(pos * div)
        pe[:, 1::2] = torch.cos(pos * div)
        self.register_buffer('pe', pe.unsqueeze(0))

    def forward(self, x):
        return self.drop(x + self.pe[:, :x.size(1)])


class TransformerBlock(nn.Module):
    def __init__(self, d_model, n_heads, d_ff, dropout=0.1):
        super().__init__()
        self.attn = nn.MultiheadAttention(d_model, n_heads, dropout=dropout, batch_first=True)
        self.ff   = nn.Sequential(nn.Linear(d_model, d_ff), nn.GELU(), nn.Dropout(dropout), nn.Linear(d_ff, d_model))
        self.ln1  = nn.LayerNorm(d_model)
        self.ln2  = nn.LayerNorm(d_model)
        self.drop = nn.Dropout(dropout)

    def forward(self, x, mask=None):
        a, _ = self.attn(x, x, x, attn_mask=mask, is_causal=(mask is None))
        x = self.ln1(x + self.drop(a))
        x = self.ln2(x + self.drop(self.ff(x)))
        return x


class RAGFusionGate(nn.Module):
    """Cross-attention gate: hidden state attends over retrieved chunks."""
    def __init__(self, d_model, rag_dim):
        super().__init__()
        self.xattn = nn.MultiheadAttention(d_model, 4, batch_first=True, kdim=rag_dim, vdim=rag_dim)
        self.gate  = nn.Linear(d_model * 2, d_model)
        self.ln    = nn.LayerNorm(d_model)

    def forward(self, x, chunks):
        if chunks is None:
            return x
        ctx, _ = self.xattn(x, chunks, chunks)
        fused  = torch.sigmoid(self.gate(torch.cat([x, ctx], dim=-1))) * ctx
        return self.ln(x + fused)


class SpecialistHead(nn.Module):
    def __init__(self, cfg, name):
        super().__init__()
        self.name     = name
        self.rag_gate = RAGFusionGate(cfg.d_model, cfg.rag_dim)
        self.layers   = nn.ModuleList([TransformerBlock(cfg.d_model, cfg.n_heads, cfg.head_d_ff, cfg.dropout) for _ in range(cfg.head_layers)])
        self.ln_out   = nn.LayerNorm(cfg.d_model)
        self.lm_head  = nn.Linear(cfg.d_model, cfg.vocab_size, bias=False)

    def forward(self, x, chunks=None, mask=None):
        x = self.rag_gate(x, chunks)
        for layer in self.layers:
            x = layer(x, mask)
        return self.lm_head(self.ln_out(x))


class HeadRouter(nn.Module):
    def __init__(self, d_model, n=3):
        super().__init__()
        self.proj = nn.Sequential(nn.Linear(d_model, 64), nn.GELU(), nn.Linear(64, n))

    def forward(self, x):
        return F.softmax(self.proj(x.mean(dim=1)), dim=-1)


class Trident(nn.Module):
    def __init__(self, cfg=None):
        super().__init__()
        self.cfg      = cfg or TridentConfig()
        c             = self.cfg
        self.embed    = nn.Embedding(c.vocab_size, c.d_model)
        self.pos_enc  = PositionalEncoding(c.d_model, c.max_seq_len, c.dropout)
        self.backbone = nn.ModuleList([TransformerBlock(c.d_model, c.n_heads, c.d_ff, c.dropout) for _ in range(c.n_layers)])
        self.ln_back  = nn.LayerNorm(c.d_model)
        self.router   = HeadRouter(c.d_model, len(c.heads))
        self.heads    = nn.ModuleDict({n: SpecialistHead(c, n) for n in c.heads})
        self.apply(self._init)

    def _init(self, m):
        if isinstance(m, nn.Linear):
            nn.init.normal_(m.weight, 0, 0.02)
            if m.bias is not None: nn.init.zeros_(m.bias)
        elif isinstance(m, nn.Embedding):
            nn.init.normal_(m.weight, 0, 0.02)

    def forward(self, ids, rag=None, head=None, return_router=False):
        B, T = ids.shape
        mask = torch.triu(torch.full((T, T), float('-inf'), device=ids.device), diagonal=1)
        x    = self.pos_enc(self.embed(ids))
        for layer in self.backbone:
            x = layer(x, mask)
        x = self.ln_back(x)
        rw = self.router(x)

        def _rag(name):
            if rag is None: return None
            return rag.get(name) if isinstance(rag, dict) else rag

        if head:
            logits = self.heads[head](x, _rag(head), mask)
        else:
            stack  = torch.stack([self.heads[n](x, _rag(n), mask) for n in self.cfg.heads], dim=1)
            logits = (stack * rw.unsqueeze(-1).unsqueeze(-1)).sum(dim=1)

        return (logits, rw) if return_router else logits

    @torch.no_grad()
    def generate(self, ids, max_new=64, temp=0.8, top_k=40, rag=None, head=None):
        self.eval()
        for _ in range(max_new):
            ctx    = ids[:, -self.cfg.max_seq_len:]
            logits = self.forward(ctx, rag=rag, head=head)[:, -1, :] / temp
            if top_k:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, -1:]] = float('-inf')
            ids = torch.cat([ids, torch.multinomial(F.softmax(logits, -1), 1)], dim=1)
        return ids

    def param_count(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


if __name__ == '__main__':
    m = Trident()
    print(f"TRIDENT  {m.param_count()/1e6:.2f}M params")
    ids = torch.randint(0, 4096, (2, 32))
    rag = torch.randn(2, 3, 128)
    logits, rw = m(ids, rag=rag, return_router=True)
    print(f"logits   {logits.shape}")
    print(f"router   {rw[0].detach().tolist()}")
    out = m.generate(ids[:1], max_new=8, rag=rag[:1])
    print(f"generated {out.shape}")
