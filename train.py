"""
TRIDENT Training Script
Tiny dataset → trains fast on CPU (Termux compatible)
Each head gets its own data stream tagged by domain.
"""

import torch, torch.nn as nn, json, os
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from model import Trident, TridentConfig

# ── Toy dataset (replace with real data) ──
SAMPLES = {
    'code': [
        "def add(a, b): return a + b",
        "for i in range(10): print(i)",
        "class Node: def __init__(self, val): self.val = val",
        "import torch; x = torch.randn(3, 3)",
        "list comprehension: [x**2 for x in range(5)]",
    ],
    'math': [
        "2 + 2 = 4",
        "integral of x dx = x^2/2 + C",
        "pythagorean theorem: a^2 + b^2 = c^2",
        "derivative of sin(x) = cos(x)",
        "fibonacci: 0 1 1 2 3 5 8 13 21",
    ],
    'research': [
        "transformers use attention mechanisms to process sequences",
        "neural networks learn representations from data",
        "backpropagation computes gradients through the chain rule",
        "embeddings map discrete tokens to continuous vector space",
        "RAG retrieves relevant context before generation",
    ]
}

HEAD_IDX = {'code': 0, 'math': 1, 'research': 2}

def tokenize(text, vocab_size=4096, max_len=64):
    ids = [ord(c) % vocab_size for c in text[:max_len]]
    return ids + [0] * (max_len - len(ids))

def make_batch(head_name, batch_size=4):
    import random
    samples = SAMPLES[head_name]
    texts   = random.choices(samples, k=batch_size)
    tokens  = torch.tensor([tokenize(t) for t in texts], dtype=torch.long)
    # next-token prediction: input = tokens[:-1], target = tokens[1:]
    return tokens[:, :-1], tokens[:, 1:]

def train(epochs=20, lr=3e-4, batch_size=4, save_path='trident.pt'):
    cfg   = TridentConfig()
    model = Trident(cfg)
    print(f"TRIDENT  {model.param_count()/1e6:.2f}M params")

    opt   = AdamW(model.parameters(), lr=lr, weight_decay=1e-2)
    sched = CosineAnnealingLR(opt, T_max=epochs)
    crit  = nn.CrossEntropyLoss()

    head_names = cfg.heads
    best_loss  = float('inf')

    for ep in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        steps = 0

        for head_name in head_names:
            for _ in range(4):   # 4 steps per head per epoch
                inp, tgt = make_batch(head_name, batch_size)
                opt.zero_grad()

                # Force the correct specialist head during training
                logits = model(inp, head=head_name)  # [B, T, vocab]
                loss   = crit(logits.reshape(-1, cfg.vocab_size), tgt.reshape(-1))
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                opt.step()

                total_loss += loss.item()
                steps += 1

        sched.step()
        avg = total_loss / steps
        bar = '█' * int(avg * 10) + '░' * max(0, 10 - int(avg * 10))
        print(f"Ep {ep:3d}/{epochs}  loss={avg:.4f}  {bar}")

        if avg < best_loss:
            best_loss = avg
            torch.save(model.state_dict(), save_path)

    print(f"\nBest loss: {best_loss:.4f}  →  saved to {save_path}")
    return model


if __name__ == '__main__':
    print("Training TRIDENT on toy dataset (CPU)...")
    model = train(epochs=30)
    print("\nDone. Load with:")
    print("  from model import Trident; m = Trident()")
    print("  m.load_state_dict(torch.load('trident.pt', map_location='cpu'))")
