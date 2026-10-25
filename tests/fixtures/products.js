// Sample catalog used by the tests only (never shipped with the site).
const L = (ar,fr) => ({ar,fr});
const C = (ar,fr,hex) => ({ar,fr,hex,image:""});
const ALL = ["S","M","L","XL","XXL"];
const P = (id,category,type,price,cost,badge,name,description,colors,sizes=ALL) =>
  ({id,category,type,price,compare_price:null,badge,name,description,colors,sizes,stock:null,image:"",active:true,sort:0,cost});
const DEFAULT_PRODUCTS = [
  P("atlas","abaya","abaya",8900,4900,"best",L("عباية الأطلس","Abaya Atlas"),L("كريب ثقيل لا يشفّ، قصّة واسعة بأكمام فراشة. مناسبة للخروج اليومي وللمناسبات.","Crêpe lourd et opaque, coupe ample, manches papillon. Pour tous les jours comme pour les occasions."),[C("أسود","Noir","#211B20"),C("كحلي","Marine","#25314A")]),
  P("nassim","abaya","abaya",7500,4100,null,L("عباية نسيم","Abaya Nassim"),L("قماش خفيف ينساب بسهولة، مثالي لأيام الصيف الحارة في البرج.","Tissu léger et fluide, idéal pour les journées chaudes de l'été."),[C("بيج رملي","Taupe","#8C7768"),C("زيتي","Olive","#5C5F46")]),
  P("nedjma","abaya","abaya-trim",11500,6300,"new",L("عباية النجمة المطرزة","Abaya Nedjma brodée"),L("تطريز ذهبي يدوي على الأكمام والذيل، لمناسبات الأعراس والأعياد.","Broderie dorée à la main sur les manches et l'ourlet, pour les mariages et les fêtes."),[C("أسود","Noir","#211B20"),C("عنابي","Bordeaux","#5E1F2E")]),
  P("mordjane","caftan","caftan",18500,10200,"new",L("قفطان المرجان","Caftan Mordjane"),L("قفطان مخملي بحزام مطرّز ومجبود ذهبي على الصدر. يُخاط حسب المقاس عند الطلب.","Caftan en velours, ceinture brodée et fil doré au buste. Ajustement sur mesure possible."),[C("مرجاني","Corail","#9E2F3C"),C("زمردي","Émeraude","#1F5A4A")]),
  P("hodna","caftan","abaya-trim",9800,5400,null,L("جلابة الحضنة","Djellaba El Hodna"),L("جلابة بقبّ وأزرار صدر يدوية، مستوحاة من لباس منطقة الحضنة.","Djellaba à capuche et boutonnière à la main, inspirée de la région du Hodna."),[C("رملي","Sable","#C2AE93"),C("رمادي","Ardoise","#59606B")]),
  P("yaqout","caftan","caftan",21000,11800,null,L("قفطان الياقوت","Caftan Yaqout"),L("ساتان ثقيل بلون الياقوت مع تطريز فتلة. قطعة العروس في ليلة الحنّة.","Satin lourd couleur rubis, broderie fetla. La pièce de la mariée pour la soirée du henné."),[C("بنفسجي داكن","Prune","#5A2347")]),
  P("loulou","dress","dress",14500,7900,null,L("فستان اللؤلؤة","Robe Loulou'a"),L("فستان سهرة طويل بأكمام كاملة وتنورة واسعة، مزيّن بحبّات لؤلؤ على الخصر.","Robe longue à manches complètes et jupe ample, perles à la taille."),[C("شمباني","Champagne","#C9B194"),C("وردي غامق","Vieux rose","#B3858A")]),
  P("chafaq","dress","dress",12900,6900,"best",L("فستان الشفق","Robe Chafaq"),L("شيفون مبطّن لا يشفّ، بحزام رفيع وقصّة تنساب حتى الكعب.","Mousseline doublée et opaque, ceinture fine, coupe fluide jusqu'aux chevilles."),[C("عنابي","Bordeaux","#6D2233"),C("أزرق بترولي","Pétrole","#23474F")]),
  P("medina","set","set",6900,3600,null,L("طقم المدينة","Ensemble Médina"),L("تونيك طويل مع تنورة متناسقة، قطعتان يمكن لبسهما منفصلتين.","Tunique longue et jupe assortie, deux pièces à porter aussi séparément."),[C("بيج وبني","Beige & brun","#B49A80"),C("رمادي فاتح","Gris perle","#9C969B")]),
  P("plisse","set","skirt",4200,2100,null,L("تنورة بليسيه طويلة","Jupe plissée longue"),L("تنورة بليسيه بخصر مطاطي مريح، تُنسّق مع كل التونيكات.","Jupe plissée à taille élastique, s'accorde avec toutes les tuniques."),[C("موكا","Moka","#7B5A4A"),C("أسود","Noir","#211B20")],["S","M","L","XL"]),
  P("khimar","hijab","khimar",2500,1100,"best",L("خمار جورجيت","Khimar georgette"),L("خمار بطبقتين يغطي الصدر، قماش جورجيت لا يحتاج إلى دبابيس كثيرة.","Khimar double couche couvrant la poitrine, georgette qui tient sans épingles."),[C("وردي ترابي","Rose poudré","#C49B97"),C("أسود","Noir","#211B20"),C("رمادي","Gris","#8D8790")],["TU"]),
  P("soie","hijab","khimar",1800,800,null,L("حجاب حرير ناعم","Foulard en soie"),L("حجاب مستطيل بلمسة حريرية لامعة، 180 × 70 سم.","Foulard rectangulaire au toucher soyeux, 180 × 70 cm."),[C("عسلي","Miel","#B98A4E"),C("أخضر مريمية","Sauge","#8A9A86")],["TU"])
].map((p,i) => ({...p, sort:i}));
if (typeof module !== 'undefined') module.exports = DEFAULT_PRODUCTS;
if (typeof window !== 'undefined') window.FB_TEST_PRODUCTS = DEFAULT_PRODUCTS;
