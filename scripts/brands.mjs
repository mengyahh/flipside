// 品牌與萬家福網址上的品牌段落對照
export const BRANDS = [
  { id: 'lianhwa', name: '聯華食品', aliases: ['聯華', '卡迪那', '卡廸那', '可樂果', '元本山', '萬歲牌'], slugs: ['聯華食品', '萬歲牌', '卡迪那', '元本山', '可樂果'] },
  { id: 'serena', name: '喜年來', aliases: ['Serena'], slugs: ['喜年來'] },
  { id: 'imei', name: '義美', aliases: ['I-Mei'], slugs: ['義美', '義美生機'] },
  { id: 'uni', name: '統一', aliases: ['統一企業', '純喫茶', '茶裏王', '麥香', '瑞穗', '統一陽光'], slugs: ['統一', '統一陽光', '統一生機', '純喫茶', '茶裏王', '麥香', '統一布丁', '瑞穗調味乳', '瑞穗鮮乳雪糕', '統一h2o'] },
  { id: 'weichuan', name: '味全', aliases: ['林鳳營', '貝納頌'], slugs: ['味全', '林鳳營', '貝納頌'] },
  { id: 'heysong', name: '黑松', aliases: ['黑松沙士', '韋恩', '茶花'], slugs: ['黑松', '黑松沙士', '黑松汽水candc氣泡飲', '黑松韋恩', '黑松汽水', '黑松茶花'] },
  { id: 'kuangchuan', name: '光泉', aliases: [], slugs: ['光泉', '光泉保久乳'] },
  { id: 'kuaikuai', name: '乖乖', aliases: [], slugs: ['乖乖', '乖乖,-孔雀'] },
  { id: 'quaker', name: '桂格', aliases: ['Quaker'], slugs: ['桂格', '桂格完膳'] },
  { id: 'hwayuan', name: '華元', aliases: [], slugs: ['華元'] },
  { id: 'taisun', name: '泰山', aliases: [], slugs: ['泰山', '泰山冰鎮'] },
  { id: 'agv', name: '愛之味', aliases: ['AGV'], slugs: ['愛之味'] },
  { id: 'hty', name: '新東陽', aliases: [], slugs: ['新東陽'] },
  { id: 'tfc', name: '台畜', aliases: [], slugs: ['台畜'] },
];
export const SLUG_TO_BRAND = new Map(BRANDS.flatMap((b) => b.slugs.map((s) => [s, b.id])));
