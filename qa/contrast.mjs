const T = {
  bg:'#F5F5F6', surface:'#FFFFFF', border:'#E4E4E7', border2:'#C9C9CE',
  text:'#14161A', text2:'#4A4F57', muted:'#666C74',
  accent:'#E8437B', accentText:'#B01253', accentBg:'#FDECF2', accentLight:'#FEF6F9', accentBorder:'#F7BED2',
  blush:'#F6C9D8', blushDeep:'#EFB4C8', blushLine:'#E7A9BF',
  cta:'#D62E6B',
  bride:'#8A4FB5', groom:'#2F5FA8', brideBg:'#ECE6FB', groomBg:'#E8EFF8',
  green:'#0F7350', greenBg:'#E3F4ED', greenBorder:'#A6DFC8',
  red:'#BC2F2A', redBg:'#FCE6D6', redBorder:'#F0C0AC',
  warn:'#96600A', warnBg:'#FBF1DA', warnBorder:'#E8CE8C',
};
const hex = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16));
const lin = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
const L = h => { const [r,g,b]=hex(h); return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b); };
const ratio = (a,b) => { const l1=L(a), l2=L(b); const [hi,lo]=l1>l2?[l1,l2]:[l2,l1]; return (hi+0.05)/(lo+0.05); };
// composite fg over bg at alpha
const over = (fg,bg,a) => '#'+hex(fg).map((c,i)=>Math.round(c*a+hex(bg)[i]*(1-a)).toString(16).padStart(2,'0')).join('');

const pairs = [
  ['text on blush', T.text, T.blush],
  ['text2 on blush', T.text2, T.blush],
  ['muted on blush', T.muted, T.blush],
  ['accentText on blush', T.accentText, T.blush],
  ['text on bg', T.text, T.bg],
  ['text2 on bg', T.text2, T.bg],
  ['muted on bg', T.muted, T.bg],
  ['text2 on surface', T.text2, T.surface],
  ['muted on surface', T.muted, T.surface],
  ['warn on warnBg', T.warn, T.warnBg],
  ['warn on surface', T.warn, T.surface],
  ['green on greenBg', T.green, T.greenBg],
  ['green on surface', T.green, T.surface],
  ['red on redBg', T.red, T.redBg],
  ['bride on brideBg', T.bride, T.brideBg],
  ['bride@.85 on brideBg', over(T.bride,T.brideBg,0.85), T.brideBg],
  ['groom on groomBg', T.groom, T.groomBg],
  ['groom@.85 on groomBg', over(T.groom,T.groomBg,0.85), T.groomBg],
  ['green@.7 on greenBg', over(T.green,T.greenBg,0.7), T.greenBg],
  ['green@.6 on greenBg', over(T.green,T.greenBg,0.6), T.greenBg],
  ['red@.7 on redBg', over(T.red,T.redBg,0.7), T.redBg],
  ['red@.6 on redBg', over(T.red,T.redBg,0.6), T.redBg],
  ['accentText on surface', T.accentText, T.surface],
  ['accentText on accentBg', T.accentText, T.accentBg],
  ['cta on surface', T.cta, T.surface],
  ['white on cta', '#FFFFFF', T.cta],
  ['text on greenBg', T.text, T.greenBg],
  ['text2 on greenBg', T.text2, T.greenBg],
  ['text2 on warnBg', T.text2, T.warnBg],
  ['muted on warnBg', T.muted, T.warnBg],
  ['text2 on redBg', T.text2, T.redBg],
  ['muted on bg (tip)', T.muted, T.bg],
  ['text on brideBg', T.text, T.brideBg],
  ['text on groomBg', T.text, T.groomBg],
  ['text2 on brideBg', T.text2, T.brideBg],
  ['text2 on groomBg', T.text2, T.groomBg],
  ['text@.7 on surface', over(T.text, T.surface, 0.7), T.surface],
  ['text on blushDeep', T.text, T.blushDeep],
  ['text on accentBg', T.text, T.accentBg],
  ['text on redBg', T.text, T.redBg],
  ['text on warnBg', T.text, T.warnBg],
  ['green@.85 on greenBg', over(T.green, T.greenBg, 0.85), T.greenBg],
  ['red@.85 on redBg', over(T.red, T.redBg, 0.85), T.redBg],
];
for (const [n,a,b] of pairs) {
  const r = ratio(a,b);
  console.log((r>=4.5?'PASS':(r>=3?'AA-lg':'FAIL')).padEnd(6), r.toFixed(2).padStart(6), ' ', n);
}
