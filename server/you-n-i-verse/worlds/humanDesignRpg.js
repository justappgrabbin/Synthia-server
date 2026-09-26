'use strict';

function lineForGate(player, gate) {
  return Number(player.iChingGateState?.activeLines?.[String(gate)] || 1);
}

function abilityManifestation(gateInfo) {
  const center = gateInfo.center || 'Field';
  const map = {
    Head: 'pressure beacon', Ajna: 'pattern lens', Throat: 'spoken construct', G: 'directional gate',
    Heart: 'will-forged implement', Spleen: 'instinct ward', Sacral: 'response engine',
    'Solar Plexus': 'emotional weather field', Root: 'pressure drive',
  };
  return map[center] || 'field technique';
}

function buildMechanics(player) {
  const canonical = player.humanDesignState?.canonical || {};
  const gateDetails = player.humanDesignState?.gates || [];
  const centers = {};
  for (const gate of gateDetails) {
    const center = gate.center || 'Unknown';
    if (!centers[center]) centers[center] = { center, activeGates: [], intensity: 0 };
    centers[center].activeGates.push(gate.gate);
    centers[center].intensity += 1;
  }
  for (const center of Object.values(centers)) {
    center.intensity = Number((center.intensity / Math.max(1, gateDetails.length)).toFixed(3));
  }

  const gates = gateDetails.map(g => ({
    canonicalGate: g.gate,
    canonicalName: g.name || `Gate ${g.gate}`,
    canonicalCenter: g.center || null,
    line: lineForGate(player, g.gate),
    abilityId: `hd-rpg:gate:${g.gate}`,
    manifestation: abilityManifestation(g),
    interpretationLayer: 'human-design-rpg-v1',
  }));

  const channels = (canonical.defined_channels || []).map(pair => ({
    canonicalChannel: pair,
    pathwayId: `hd-rpg:channel:${pair[0]}-${pair[1]}`,
    manifestation: 'traversable resonance route',
  }));

  return {
    source: 'canonical-human-design-adapter',
    canonicalChartVersion: player.humanDesignState?.adapterVersion,
    centers,
    channels,
    gates,
    authority: canonical.authority || null,
    profile: canonical.profile || null,
    definition: canonical.definition || null,
    undefinedMechanics: canonical.undefined_centers || [],
  };
}

function parseAction(action, mechanics) {
  const text = String(action || '').trim().toLowerCase();
  const gateMatch = text.match(/gate\s*(\d{1,2})/);
  const channelMatch = text.match(/(\d{1,2})\s*[-/]\s*(\d{1,2})/);
  if (gateMatch) return { kind: 'invoke_gate', gate: Number(gateMatch[1]), raw: text };
  if (channelMatch) return { kind: 'traverse_channel', channel: [Number(channelMatch[1]), Number(channelMatch[2])], raw: text };
  if (/center|attune|amplif/.test(text)) {
    const center = Object.keys(mechanics.centers).find(c => text.includes(c.toLowerCase())) || Object.keys(mechanics.centers)[0];
    return { kind: 'attune_center', center, raw: text };
  }
  if (/relate|ally|companion|connect/.test(text)) return { kind: 'relationship', raw: text };
  const fallback = mechanics.gates[0];
  return { kinY	Ú[ÚÙWÙØ]IËØ]N[XÚÏËØ[ÛXØ[Ø]HK]Î^	Ú[ÚÙIÈNÂB[Ý[ÛÜX]R[X[\ÚYÛÕÛÜ

HÂ]\ÂY	Ú[X[Y\ÚYÛ\ÉË]N	Ò[X[\ÚYÛÉË\Ú[Û	ÌK	Ë\Þ[È[\È^Y\Ù\XÙ\Ë][Ý\ÔÝ]HJHÂÛÛÝYXÚ[XÜÈH][Ý\ÔÝ]OËYXÚ[XÜÈZ[YXÚ[XÜÊ^Y\NÂÛÛÝÝ]HH][Ý\ÔÝ]HÂØ[YRY\ËYÛÜ\Ú[Û\Ë\Ú[ÛØÙ[RY	Ü\ÛÛ[ÙKXÚ]Y[	Ë\ÝÜTÜÚ][ÛÉØ\][	Ë	Ü\ÛÛ[ÙKXÚ]Y[	×KÝ\[]Y\Ý	Õ\ÙH[Ý\XÝX[ÛÛYÝ\][ÛÈÜ[H\Ý][ÈÝ]KËØØ[[[ÜN×KØØ[[][ÛÚ\ÎßKØØ[ÛÜÝ]NÂXÙN	Ô\ÛÛ[ÙHÚ]Y[	ËY[Ú\ÙNÜ[YØ]]Ø^\Î×K]\ÙYÚ[[Î×KÙ[\\Ú]XÝ\NßK[ÛÝ[\\ÜÝ\NKYXÚ[XÜËÝ\[[Ü[ÙÎ×KÜX]Y]]È]J
KÒTÓÔÝ[Ê
K\]Y]]È]J
KÒTÓÔÝ[Ê
KNÂÛÛÝ\ÚXPÚ[[ÈHYXÚ[XÜËÚ[[ËX\
ÚOÂÛÛÝHH^Y\[X[\ÚYÛÝ]KØ]\Ë[
ÈOËØ]HOOHÚØ[ÛXØ[Ú[[ÌJNÂÛÛÝH^Y\[X[\ÚYÛÝ]KØ]\Ë[
ÈOËØ]HOOHÚØ[ÛXØ[Ú[[ÌWJNÂ]\ØOËÙ[\	ÑÉËËÙ[\	ÕØ]	×NÂJNÂY
\Ý]KÝ\[[Ü
HÂÛÛÝ[ÜH]ØZ]Ù\XÙ\ËÜX]S[Ü
Â^Y\Y^Y\^Y\YØ[YRY\ËYØÙ[RYÝ]KØÙ[RY\]]TÛN	ØÚ\XX\\ËÚ\[\YXØ][ÛÎØXÝ[Y\ÊYXÚ[XÜËÙ[\ÊKX\
ÈO
ÈÙ[\ËÙ[\Ý[Ý
ÈË[[Ú]HJJK\ÚXPÚ[[Ë[ÙÜX][Û[\ÎÈ\Ú]\N	ØÚ\XX\\Ë[[Y[	ØY]\ÈKX\ÛÛ	ÝÛÜÙ[WÚÜÚXÝ[ÛËJNÂÝ]KÝ\[[ÜH[Ü[ÜYÂBÝ]K\]Y]H]È]J
KÒTÓÔÝ[Ê
NÂ]\Ý]NÂK\Þ[ÈXÝ
È^Y\Ý]KXÝ[ÛÙ\XÙ\ÈJHÂÛÛÝYXÚ[XÐXÝ[ÛH\ÙPXÝ[ÛXÝ[ÛÝ]KYXÚ[XÜÊNÂÛÛÝÛÜHÝ]KØØ[ÛÜÝ]NÂ]ØÙ\XHH	ÉÎÂ]Ù[XÝYØ]HH[ÂY
YXÚ[XÐXÝ[ÛÚ[OOH	Ú[ÚÙWÙØ]IÊHÂÛÛÝX[]HHÝ]KYXÚ[XÜËØ]\Ë[
ÈOËØ[ÛXØ[Ø]HOOHYXÚ[XÐXÝ[ÛØ]JNÂY
XX[]JHÝÈ]È\ÜØ]WÛÝØXÝ]WÙÜÜ^Y\ÛYXÚ[XÐXÝ[ÛØ]_X
NÂÙ[XÝYØ]HHX[]KØ[ÛXØ[Ø]NÂY
]ÛÜÜ[YØ]]Ø^\Ë[ÛY\ÊÙ[XÝYØ]JJHÛÜÜ[YØ]]Ø^\Ë\Ú
Ù[XÝYØ]JNÂÛÜY[Ú\ÙHH[X\
ÛÜY[Ú\ÙH
È
ÈX[]K[H
ÊKÑ^Y
ÊJNÂØÙ\XHHØ]H	ØX[]KØ[ÛXØ[Ø]_H[XZ[ÈØ[ÛXØ[H	ØX[]KØ[ÛXØ[[Y_NÈ[\ÈÛÜ]X[Y\ÝÈ\ÈH	ØX[]KX[Y\Ý][ÛK[HÚ]Y[\ÚXØ[HÜ[È\Ý[]ÂH[ÙHY
YXÚ[XÐXÝ[ÛÚ[OOH	Ý]\ÙWØÚ[[	ÊHÂÛÛÝX]ÚHÝ]KYXÚ[XÜËÚ[[Ë[
ÈOËØ[ÛXØ[Ú[[Ú[	ËIÊHOOHYXÚ[XÐXÝ[ÛÚ[[Ú[	ËIÊHËØ[ÛXØ[Ú[[ÛXÙJ
K]\ÙJ
KÚ[	ËIÊHOOHYXÚ[XÐXÝ[ÛÚ[[Ú[	ËIÊJNÂY
[X]Ú
HÝÈ]È\ÜÚ[[ÛÝÙY[YÙÜÜ^Y\ÛYXÚ[XÐXÝ[ÛÚ[[Ú[	ËIÊ_X
NÂÛÛÝÙ^HHX]ÚØ[ÛXØ[Ú[[Ú[	ËIÊNÂY
]ÛÜ]\ÙYÚ[[Ë[ÛY\ÊÙ^JJHÛÜ]\ÙYÚ[[Ë\Ú
Ù^JNÂÛÜY[Ú\ÙHH[X\
ÛÜY[Ú\ÙH
ÈÍJKÑ^Y
ÊJNÂÙ[XÝYØ]HHX]ÚØ[ÛXØ[Ú[[ÌNÂØÙ\XHHH	ÚÙ^_HÚ[[XÛÛY\ÈH]\ØXHÝ]HÝYÚH\Ú]XÝ\H[ÝXYÙHX[\ÚYHHÚ\XÝ\ÂH[ÙHY
YXÚ[XÐXÝ[ÛÚ[OOH	Ø][WØÙ[\ÊHÂÛÛÝÙ[\HYXÚ[XÐXÝ[ÛÙ[\ÂY
\Ý]KYXÚ[XÜËÙ[\ÖØÙ[\JHÝÈ]È\ÜÙ[\ÛÝØXÝ]NØÙ[\X
NÂÛÜÙ[\\Ú]XÝ\VØÙ[\HH
ÛÜÙ[\\Ú]XÝ\VØÙ[\H
H
ÈNÂÛÜY[Ú\ÙHH[X\
ÛÜY[Ú\ÙH
ÈMJKÑ^Y
ÊJNÂÙ[XÝYØ]HHÝ]KYXÚ[XÜËÙ[\ÖØÙ[\KXÝ]QØ]\ÖÌNÂØÙ\XHHH	ØÙ[\HÙ[\XÛÛY\È\ÚXH\Ú]XÝ\HÚ][[Ú]H	ÝÛÜÙ[\\Ú]XÝ\VØÙ[\_KÂH[ÙHÂÛÜ[ÛÝ[\\ÜÝ\HH[X\
ÛÜ[ÛÝ[\\ÜÝ\H
ÈJKÑ^Y
ÊJNÂÙ[XÝYØ]HHÝ]KYXÚ[XÜËØ]\ÖÌOËØ[ÛXØ[Ø]HNÂØÙ\XHH	ÕH[][ÛÚ\Ú[Ù\ÈHÛÛ\ÜÚ]HY[[ÚYÈHÛÛH\Ý[Ý\XÚ\[ËÎÂBÛÛÝ[HH[QÜØ]J^Y\Ù[XÝYØ]HJNÂÛÛÝ\ÛÛ][ÛH]ØZ]Ù\XÙ\Ë\ÛÛRPÚ[ÊÂ^Y\Ý]N^Y\ÛÜÝ]NÛÜ[][ÛÚ\Ý]NÝ]KØØ[[][ÛÚ\ËXÝ]R^YÜ[NÙ[XÝYØ]HKXÝ]S[N[K][Ý\ÔÝ]NÈÛÜK][	ÚÜ×ØXÝ[ÛËÚÚXÙNYXÚ[XÐXÝ[Û[\Ü[Ý]NÈ\Ý]K\KJNÂY
\ÛÛ][Û\]]T\ÜÝ\OË[JHÂÛÜ[ÛÝ[\\ÜÝ\HHX]X^
X]Z[KK[X\
ÛÜ[ÛÝ[\\ÜÝ\H
È[X\\ÛÛ][Û\]]T\ÜÝ\K[JJKÑ^Y
ÊJJJNÂBÛÛÝÙ[\[\YXØ][ÛÈHØXÝ[Y\ÊÝ]KYXÚ[XÜËÙ[\ÊKX\
ÈO
ÂÙ[\ËÙ[\Ý[ÝÈ
ÈË[[Ú]H
È
Ù[XÝYØ]H	ËXÝ]QØ]\Ë[ÛY\ÊÙ[XÝYØ]JHÈÈ
KJJNÂÛÛÝ\ÚXPÚ[[ÈHÝ]KYXÚ[XÜËÚ[[ËX\
ÚOÂÛÛÝHH^Y\[X[\ÚYÛÝ]KØ]\Ë[
ÈOËØ]HOOHÚØ[ÛXØ[Ú[[ÌJNÂÛÛÝH^Y\[X[\ÚYÛÝ]KØ]\Ë[
ÈOËØ]HOOHÚØ[ÛXØ[Ú[[ÌWJNÂ]\ØOËÙ[\	ÑÉËËÙ[\	ÕØ]	×NÂJNÂÛÛÝ[ÜH]ØZ]Ù\XÙ\ËÜX]S[Ü
Â^Y\Y^Y\^Y\YØ[YRY\ËYØÙ[RYÝ]KØÙ[RY\]]TÛNYXÚ[XÐXÝ[ÛÚ[OOH	Ú[ÚÙWÙØ]IÈÈ	ÙØ]KXX\\È	Ü]Ø[Ù\ËÚ\[\YXØ][ÛÎÙ[\[\YXØ][ÛË\ÚXPÚ[[Ë[\ÛY[[[Y[ÙNÛÜ[ÙÜX][Û[\ÎÂ\Ú]\NYXÚ[XÐXÝ[ÛÚ[OOH	Ý]\ÙWØÚ[[	ÈÈ	Ü]Ø[Ù\È	ÙØ]KXX\\Ë[[Y[\ÛÛ][ÛÝ]S[Ý[Y[OOH	Ü]\ÙIÈÈ	ØZ\È\ÛÛ][ÛÝ]S[Ý[Y[OOH	Ý[ÙÜIÈÈ	Ù\IÈ	ØY]\ËÙTØØ[NH
ÈX]Z[ÍKÛÜY[Ú\ÙH

KKXÝ]QØ]TÝ]\ÎÙ[XÝYØ]HÈÜÙ[XÝYØ]WH×KX\ÛÛÛYXÚ[XÎÛYXÚ[XÐXÝ[ÛÚ[XJNÂÝ]K\
ÏHNÂÝ]KÝ\[[ÜH[Ü[ÜYÂÝ]K\]Y]H]È]J
KÒTÓÔÝ[Ê
NÂÝ]KÙË\Ú
È\Ý]K\XÝ[ÛYXÚ[XÐXÝ[ÛØÙ\XK\ÛÛ][Û[ÜY[Ü[ÜY]Ý]K\]Y]JNÂ]\ÈÝ]KØÙ\XK\ÛÛ][Û[ÜYXÚ[XÐXÝ[ÛNÂKNÂB[Ù[K^ÜÈHÈÜX]R[X[\ÚYÛÕÛÜZ[YXÚ[XÜË\ÙPXÝ[ÛNÂ