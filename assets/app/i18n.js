/* English and Arabic. The language is picked before first paint (index.html: a ?lang= link,
 * else the saved choice, else the device language) and set on <html lang dir>; this file
 * translates the page's fixed text and gives the scripts T(), T.count(), T.unit() and T.list().
 *
 *   T('English text', { var: value })   the Arabic for that text when the page is in Arabic,
 *                                        else the English; {var} placeholders are filled in.
 * Keys are the English text itself, so the code stays readable and anything without a
 * translation falls back to English. Area names stay as registered in Ejari (English), which is
 * also what the search matches. Numbers keep Western digits, as on Ejari contracts.
 * tests/i18n.test.mjs checks that every T('…') key used by the page has an Arabic entry.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.T = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const doc = root.document;
  const LANG = doc && doc.documentElement.lang === 'ar' ? 'ar' : 'en';

  // Fixed page text, by its data-t key (index.html).
  const STATIC = {
    title: 'أطلس دبي العقاري',
    tagline: 'ما <b>يدفعه المستأجرون فعلًا</b> سنويًا، من عقود الإيجار المسجلة في نظام إيجاري لدى دائرة الأراضي والأملاك في دبي. وليست أسعارًا معروضة.',
    filters: 'التصفية', ptype: 'نوع العقار', done: 'تم',
    'f.search': 'المجتمع أو المبنى', 'f.search.ph': 'مثلًا: JVC أو Marina أو Karama',
    'f.unit': 'الوحدة', 'f.metric': 'ما تعرضه العلامات',
    'm.median': 'الإيجار السنوي الوسيط', 'm.sale': 'سعر البيع الوسيط', 'm.sqm': 'الإيجار لكل م² سنويًا', 'm.n': 'عدد العقود',
    'f.min': 'أدنى إيجار (درهم)', 'f.max': 'أعلى إيجار (درهم)', any: 'أي مبلغ',
    hide: 'إخفاء هذا التنبيه', facts: 'أرقام رئيسية',
    'd.n12': 'العقود، آخر 12 شهرًا', 'd.mapped': 'على الخريطة', 'd.data': 'البيانات',
    'd.mapped2': 'على الخريطة', 'd.updated': 'آخر تحديث', 'f.home': 'المسكن',
    'f.find': 'ابحث في الجدول', 'f.find.ph': 'ابحث في الجدول',
    'f.range': 'نطاق الإيجار (درهم)', 'ph.min': 'من', 'ph.max': 'إلى', 'd.areas': 'مناطق على الخريطة',
    'a.health': 'حالة البيانات', 'a.health2': 'كل مصدر تجرّبه أدوات الجمع، وكيف جرى آخر تشغيل له.',
    csv: 'تنزيل CSV', table: 'جدول الإيجارات (قابل للتمرير)', loadingRents: 'جارٍ تحميل الإيجارات…',
    about: 'عن البيانات', 'a.read': 'قراءة الخريطة',
    'a.read1': 'كل علامة تُظهر الإيجار السنوي المعتاد (الوسيط) لمنطقة ما للمسكن الذي اخترته، على شارة بلون سعرها في المفتاح. وحين تتقارب المناطق بحيث تصعب قراءتها، تندمج في علامة واحدة تحمل اسم أكثرها عقودًا وعدد المناطق الأخرى (مثل «JLT +12»)، وتعرض متوسطها مرجّحًا بعدد العقود. اضغط عليها للتكبير، واضغط على علامة منطقة واحدة لعرض التفاصيل حسب نوع الوحدة.',
    'a.read2': 'توضع العلامات عند نقطة مرجعية تقريبية لكل منطقة، وليس على مبنى بعينه.',
    'a.where': 'مصدر الأرقام', loading: 'جارٍ التحميل…',
    'a.unm': 'مناطق لم تظهر على الخريطة بعد (<span id="unmatchedN">0</span>)',
    'a.unm2': 'تظهر في الجدول. تُضاف نقاطها على الخريطة من بيانات بلدية دبي وOpenStreetMap.',
    'a.not': 'ما ليس عليه هذا الموقع',
    'a.not1': 'ليست أسعارًا معروضة من مواقع الإعلانات، وليس مؤشر الإيجارات الصادر عن مؤسسة التنظيم العقاري (ريرا) المستخدم لزيادات الإيجار. أداة مستقلة، وليست خدمة رسمية من دائرة الأراضي والأملاك أو ريرا.',
    'a.src': 'المصادر: عقود إيجار مسجلة في إيجاري، <a href="https://www.dubaipulse.gov.ae/data/dld-registration/dld_rent_contracts-open" target="_blank" rel="noopener">البيانات المفتوحة لدائرة الأراضي والأملاك</a> عبر دبي بلس. حدود المجتمعات: <a href="https://www.dubaipulse.gov.ae/data/dm-location/dm_community-open" target="_blank" rel="noopener">بلدية دبي</a>. القيم الوسيطة للمجتمعات: <a href="https://datadubai.ae/" target="_blank" rel="noopener">Dubai Data</a> وContinental Club Property، بترخيص <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> (أعيدت صياغتها في علامات الخريطة والجدول). المناطق القديمة (ديرة وبر دبي والكرامة وغيرها): <a href="https://continentalclub.ae/data-center/" target="_blank" rel="noopener">Continental Club Property</a>، بترخيص CC BY 4.0، القيمة الوسيطة حسب حجم الوحدة. بعض نقاط المناطق والخريطة: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">المساهمون في OpenStreetMap</a>، ODbL. <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">الإبلاغ عن مشكلة في الخريطة</a>.',
    'a.built': 'صُمّم باستخدام Leaflet (BSD-2-Clause) وGSAP (ترخيص قياسي مجاني) وLenis (MIT) وخطوط Barlow (SIL OFL). العداد المتحرك وحركة العنوان نسختان خاصتان بنا من Counter وSplitText من React Bits.',
    map: 'الخريطة', mapRegion: 'خريطة الإيجارات السنوية حسب المنطقة',
  };

  // Text the scripts build (atlas.js, companion.js), keyed by its English.
  const AR = {
    'Sale price per sq ft, monthly': 'سعر البيع الشهري لكل قدم مربعة',
    '{sign}{v}% on a year ago': '{sign}{v}% مقارنة بالعام الماضي',
    'Sale price per sq ft, {a} to {b}': 'سعر البيع لكل قدم مربعة، من {a} إلى {b}',
    'For owners: median sale price {sale}.': 'للملاك: سعر البيع الوسيط {sale}.',
    'For owners: median sale price {sale}, gross rental yield {v}%.': 'للملاك: سعر البيع الوسيط {sale}، والعائد الإيجاري الإجمالي {v}%.',
    'Median sale price (AED)': 'سعر البيع الوسيط (درهم)',
    'Gross rental yield by area and unit': 'العائد الإيجاري الإجمالي حسب المنطقة والوحدة',
    'Median sale price by area and unit, from registered sales': 'سعر البيع الوسيط حسب المنطقة والوحدة، من المبيعات المسجلة',
    'Yields by area': 'العوائد حسب المنطقة',
    'Sale prices by area': 'أسعار البيع حسب المنطقة',
    'Dashed: fewer than {n} contracts': 'الإطار المتقطع: أقل من {n} عقود',
    'Older districts have rents only, so they show in the rent view.': 'المناطق القديمة لها إيجارات فقط، لذا تظهر في عرض الإيجار.',
    'Italic rows: fewer than {n} contracts, so treat them as a rough guide.': 'الصفوف المائلة: أقل من {n} عقود، فاعتبرها تقديرًا تقريبيًا.',
    'Fewer than {n} contracts: a thin figure': 'أقل من {n} عقود: رقم ضعيف الدلالة',
    'Average sale price': 'متوسط سعر البيع',
    'Median sale price': 'سعر البيع الوسيط',
    'Yield': 'العائد',
    'Sale price': 'سعر البيع',
    'Rent': 'الإيجار',
    'Map shows': 'تعرض الخريطة',
    'Dial: share of {top}; 95% of areas are below it': 'المؤشر: نسبة من {top}؛ 95% من المناطق أقل منه',
    'Photos taken near this point, from Wikimedia Commons. Tap one to see it large, with its author and licence.': 'صور التُقطت قرب هذه النقطة، من ويكيميديا كومنز. اضغط على صورة لعرضها بحجم كبير مع مصوّرها وترخيصها.',
    'Photo {i} of {n}': 'الصورة {i} من {n}',
    'View on Wikimedia Commons': 'عرضها على ويكيميديا كومنز',
    'Next photo': 'الصورة التالية',
    'Previous photo': 'الصورة السابقة',
    'Photo': 'صورة',
    'Area details': 'تفاصيل المنطقة',
    'unknown author': 'مصوّر غير معروف',
    'Photos on Google': 'صور على Google',
    'Street View': 'التجوّل الافتراضي',
    'Google Maps': 'خرائط Google',
    '(Median {aed} a year when you set this reminder.)': '(كان الوسيط {aed} سنويًا عند ضبط هذا التذكير.)',
    '(optional)': '(اختياري)',
    '(to {d}).': '(حتى {d}).',
    ', ': '، ',
    ', median sale price AED {v}': '، وسعر البيع الوسيط AED {v}',
    ', to {d}': '، حتى {d}',
    '<b>New figures since your last visit</b>: rents now run to {to} (was {from}).': '<b>أرقام جديدة منذ زيارتك الأخيرة</b>: تمتد الإيجارات الآن حتى {to} (كانت حتى {from}).',
    "<b>The rent data didn't load.</b> This is usually a brief network hiccup.": '<b>لم يتم تحميل بيانات الإيجار.</b> غالبًا ما يكون ذلك خللًا عابرًا في الشبكة.',
    'A reminder you set on Dubai Real Estate Atlas to see how rents have moved. Delete this event to stop it.': 'تذكير ضبطته في أطلس دبي العقاري لمتابعة تغيّر الإيجارات. احذف هذا الحدث لإيقافه.',
    'AED per m²': 'درهم لكل م²',
    'AED {v} per m² a year': 'AED {v} لكل م² سنويًا',
    'Add to my calendar': 'أضف إلى تقويمي',
    'All Dubai': 'كل دبي',
    'All homes': 'كل المساكن',
    'All units': 'كل الوحدات',
    'Area': 'المنطقة',
    'Areas here have figures per unit only: pick a unit (e.g. 1 bed) to see them.': 'للمناطق هنا أرقام حسب نوع الوحدة فقط: اختر وحدة (مثل غرفة نوم واحدة) لعرضها.',
    'Average gross yield': 'متوسط العائد الإجمالي',
    'Average rent per m²': 'متوسط الإيجار لكل م²',
    'Average yearly rent': 'متوسط الإيجار السنوي',
    'Building': 'المبنى',
    'Both': 'كلاهما',
    'Busiest buildings': 'أكثر المباني نشاطًا',
    'Cheaper than <b>{pct}%</b> of {of} areas with figures for {what}.': 'أرخص من <b>{pct}%</b> من {of} منطقة لديها أرقام لـ{what}.',
    'Check': 'تحقّق',
    'Check Dubai rents': 'راجع إيجارات دبي',
    'Check a rent': 'تحقّق من إيجار',
    'Check a rent here': 'تحقّق من إيجار هنا',
    'Check a rent: type an area': 'تحقّق من إيجار: اكتب اسم منطقة',
    'Clear': 'مسح',
    'Close': 'إغلاق',
    'Commercial': 'التجاري',
    'Compare with my rent': 'قارن بإيجاري',
    'Contracts': 'العقود',
    'Contracts that started in the last 30 days, newest first': 'العقود التي بدأت خلال آخر 30 يومًا، الأحدث أولًا',
    'DLD area': 'منطقة الدائرة',
    'DLD area: {list}. The point is an approximate reference for the area, not a building.': 'منطقة دائرة الأراضي: {list}. النقطة مرجع تقريبي للمنطقة، وليست مبنى بعينه.',
    'Daily': 'يوميًا',
    'Dark': 'داكن',
    'Data runs through': 'البيانات حتى',
    'Delete my saved data': 'احذف بياناتي المحفوظة',
    'Delete your saved areas, recent checks and settings from this browser?': 'هل تريد حذف مناطقك المحفوظة وعمليات التحقق الأخيرة والإعدادات من هذا المتصفح؟',
    'Did you mean:': 'هل تقصد:',
    'Download my data': 'نزّل بياناتي',
    "Downloads a calendar event; your calendar app reminds you. A good time to check the market is before your landlord's renewal notice (usually 90 days ahead).": 'يُنزّل حدثًا في التقويم، ويتولى تطبيق التقويم تذكيرك. أفضل وقت لمراجعة السوق قبل إشعار التجديد من المالك (عادةً قبل 90 يومًا).',
    'Dubai Data groups homes by bedrooms: in villa communities this figure may include villas and townhouses.': 'تجمع Dubai Data المساكن حسب عدد الغرف: في مجتمعات الفلل قد يشمل هذا الرقم الفلل والتاون هاوس.',
    'Dubai Data has not published a newer update yet, so changes since then are not shown.': 'لم تنشر Dubai Data تحديثًا أحدث بعد، لذا لا تظهر التغييرات منذ ذلك الحين.',
    'Dubai Data page': 'صفحة Dubai Data',
    'Dubai Land Department Ejari contracts': 'عقود إيجاري لدى دائرة الأراضي والأملاك في دبي',
    'Dubai Real Estate Atlas': 'أطلس دبي العقاري',
    'Everything': 'الكل',
    'Every 3 months': 'كل 3 أشهر',
    'Every 6 months': 'كل 6 أشهر',
    'Figures exist for:': 'تتوفر أرقام لـ:',
    'Figures:': 'الأرقام:',
    'Flats': 'الشقق',
    'For owners: gross rental yield {v}%.': 'للملاك: العائد الإيجاري الإجمالي {v}%.',
    'Got it': 'حسنًا',
    'Gross rental yield': 'العائد الإيجاري الإجمالي',
    'Gross yield': 'العائد الإجمالي',
    'Gross yield {v}%': 'العائد الإجمالي {v}%',
    'Half of these tenants pay more and half less.': 'نصف هؤلاء المستأجرين يدفعون أكثر ونصفهم أقل.',
    'Home': 'المسكن',
    'Homes': 'المساكن',
    'Import': 'استيراد',
    'Light': 'فاتح',
    'Language of place names on the map': 'لغة أسماء الأماكن على الخريطة',
    'Link copied': 'تم نسخ الرابط',
    'Map labels': 'أسماء الخريطة',
    'Median': 'الوسيط',
    'Median AED': 'الوسيط (درهم)',
    'Median for this home type, {period}. Source: Continental Club Property (CC BY 4.0), which gives {n} for the whole area but no count per home type.': 'الوسيط لهذا النوع من المساكن، {period}. المصدر: Continental Club Property (CC BY 4.0)، التي تذكر {n} للمنطقة كلها دون عدد لكل نوع مسكن.',
    'Median for {unit} {aed} a year (no all-homes median is published for this area); ': 'الوسيط لـ{unit}: {aed} سنويًا (لا يُنشر وسيط لكل المساكن في هذه المنطقة)؛ ',
    'Median of {n}, {period}.': 'وسيط {n}، {period}.',
    'Median yearly rent': 'الإيجار السنوي الوسيط',
    'Median yearly rent (AED)': 'الإيجار السنوي الوسيط (درهم)',
    'Median yearly rent by area and unit, last 12 months': 'الإيجار السنوي الوسيط حسب المنطقة والوحدة، آخر 12 شهرًا',
    'Median {aed} a year from ': 'الوسيط {aed} سنويًا من ',
    'Middle half pay AED {a} to {b}': 'النصف الأوسط يدفع من AED {a} إلى {b}',
    'Monthly median rent': 'الإيجار الوسيط الشهري',
    'Monthly median, {a} to {b}': 'الوسيط الشهري، من {a} إلى {b}',
    'My areas': 'مناطقي',
    'My lease renews on': 'يتجدد عقدي في',
    'Never': 'أبدًا',
    'New or renewal': 'جديد أو تجديد',
    'Newest contract start': 'أحدث بداية عقد',
    'Newest contracts': 'أحدث العقود',
    'No area called “{q}” in the data.': 'لا توجد منطقة باسم «{q}» في البيانات.',
    'No areas match. Clear the search or widen the rent range.': 'لا توجد مناطق مطابقة. امسح البحث أو وسّع نطاق الإيجار.',
    'No contracts match. Clear the search or widen the rent range.': 'لا توجد عقود مطابقة. امسح البحث أو وسّع نطاق الإيجار.',
    'No range yet: the open sources publish only the middle figure (half pay more, half less). Ranges arrive with contract-level data.': 'لا يتوفر نطاق بعد: المصادر المفتوحة تنشر الرقم الأوسط فقط (نصف المستأجرين يدفعون أكثر ونصفهم أقل). تأتي النطاقات مع بيانات العقود التفصيلية.',
    'None': 'لا يوجد',
    'Nothing to show here for {type}. Zoom out to see more.': 'لا شيء لعرضه هنا لفئة {type}. صغّر الخريطة لرؤية المزيد.',
    'Older districts (no all-homes median): pick a unit to see them': 'المناطق القديمة (بلا وسيط لكل المساكن): اختر وحدة لعرضها',
    'Once a year': 'مرة في السنة',
    'Pick an area first': 'اختر منطقة أولًا',
    'Recent:': 'الأخيرة:',
    'Remind me': 'ذكّرني',
    'Remind me before renewal': 'ذكّرني قبل التجديد',
    'Remind me to check the market': 'ذكّرني بمراجعة السوق',
    'Reminder downloaded: open the file to add it to your calendar. It will remind you {d} days before {date}.': 'تم تنزيل التذكير: افتح الملف لإضافته إلى تقويمك. سيذكّرك قبل {d} يومًا من {date}.',
    'Reminders and your saved data': 'التذكيرات وبياناتك المحفوظة',
    'Reminders go into your own calendar, which does the reminding: delete the event there to stop it. Your areas and checks are saved only in this browser, never sent anywhere. The site counts visits and which features are used (GoatCounter: no cookies, nothing personal).': 'تُضاف التذكيرات إلى تقويمك أنت، وهو من يتولى التذكير: احذف الحدث هناك لإيقافه. تُحفظ مناطقك وعمليات التحقق في هذا المتصفح فقط، ولا تُرسل إلى أي مكان. يحصي الموقع الزيارات والميزات المستخدمة (GoatCounter: بلا ملفات تعريف ارتباط ولا بيانات شخصية).',
    'Remove {area} from My areas': 'إزالة {area} من مناطقي',
    'Renewal reminders arrive': 'موعد تذكيرات التجديد',
    'Renews {d}': 'يتجدد في {d}',
    'Rent per m²': 'الإيجار لكل م²',
    'Rent renewal: {area} (check the market)': 'تجديد الإيجار: {area} (راجع السوق)',
    'Rents by area': 'الإيجارات حسب المنطقة',
    'Rents in {area}, from Ejari contracts.': 'الإيجارات في {area}، من عقود إيجاري.',
    'Same home for less nearby:': 'المسكن نفسه بسعر أقل في الجوار:',
    'Save to My areas': 'احفظ في مناطقي',
    'Saved': 'محفوظة',
    'Several areas match “{q}”.': 'عدة مناطق تطابق «{q}».',
    'Share': 'مشاركة',
    'Show all of Dubai': 'اعرض دبي كلها',
    'Show on the map': 'اعرض على الخريطة',
    'Showing the newest 500 of {n}. Download the CSV for all of them.': 'يُعرض أحدث 500 من {n}. نزّل ملف CSV للاطلاع عليها كلها.',
    'Size, floor, view and building all move the price.': 'المساحة والطابق والإطلالة والمبنى كلها تؤثر في السعر.',
    'Some areas are missing until daily contract data is switched on.': 'بعض المناطق غير متوفرة حتى تفعيل بيانات العقود اليومية.',
    'Start': 'البداية',
    'Studios': 'الاستوديوهات',
    'Switch to dark mode': 'التبديل إلى الوضع الداكن',
    'Switch to light mode': 'التبديل إلى الوضع الفاتح',
    'Tell me what changed when I come back': 'أخبرني بما تغيّر عند عودتي',
    'That file is not a Dubai Real Estate Atlas export.': 'هذا الملف ليس ملف تصدير من أطلس دبي العقاري.',
    'That is in the cheapest quarter.': 'هذا ضمن الربع الأرخص.',
    'That is in the dearest quarter.': 'هذا ضمن الربع الأغلى.',
    'That is within the middle half.': 'هذا ضمن النصف الأوسط.',
    'The daily update has not brought in newer contracts, so changes since then are not shown.': 'لم يأتِ التحديث اليومي بعقود أحدث، لذا لا تظهر التغييرات منذ ذلك الحين.',
    'The middle half of these tenants pay <b>{a}</b> to <b>{b}</b>.': 'النصف الأوسط من هؤلاء المستأجرين يدفع من <b>{a}</b> إلى <b>{b}</b>.',
    'The rent data could not be loaded. Reload the page; if it keeps failing, the daily update has not run yet.': 'تعذّر تحميل بيانات الإيجار. أعد تحميل الصفحة؛ وإن تكرر الخطأ فالتحديث اليومي لم يعمل بعد.',
    'This data is {n} days old': 'عمر هذه البيانات {n} يومًا',
    'Too few contracts for {unit} in {area} to give a fair figure.': 'عدد عقود {unit} في {area} قليل جدًا لإعطاء رقم منصف.',
    'Trend:': 'الاتجاه:',
    'Try again': 'حاول مرة أخرى',
    'Try the area name on your Ejari contract (for example <i>Al Barsha South Fourth</i> for JVC), or find it on the map.': 'جرّب اسم المنطقة كما يظهر في عقد إيجاري (مثلًا <i>Al Barsha South Fourth</i> لمنطقة JVC)، أو ابحث عنها على الخريطة.',
    'Typical of {n}, {period}.': 'القيمة المعتادة من {n}، {period}.',
    'Typical yearly rent': 'الإيجار السنوي المعتاد',
    'Typical {v}': 'المعتاد {v}',
    'Mixed home sizes: pick one for a fair comparison.': 'أحجام مساكن مختلطة: اختر حجمًا واحدًا لمقارنة عادلة.',
    'Figures from': 'الأرقام من',
    'Checked against': 'مُقارنة مع',
    'Near me': 'بالقرب مني',
    'Show where I am': 'أظهر موقعي',
    'You seem to be outside Dubai.': 'يبدو أنك خارج دبي.',
    'Your location isn’t available. Check that this site may use it.': 'موقعك غير متاح. تأكّد من السماح لهذا الموقع باستخدامه.',
    '{unit}: median {aed} a year from {n}': '{unit}: الوسيط {aed} سنويًا من {n}',
    '{unit}: median {aed} a year': '{unit}: الوسيط {aed} سنويًا',
    'median sale price AED {v}': 'سعر البيع الوسيط {v} درهم',
    'All homes:': 'كل المساكن:',
    'Dearer than <b>{pct}%</b> of {of} areas with figures for {what}.': 'أغلى من <b>{pct}%</b> من {of} منطقة لديها أرقام لـ{what}.',
    'What does this mean?': 'ماذا يعني هذا؟',
    'The median is the middle contract: half of these tenants pay more and half less. Size, floor, view and building all move the price.': 'الوسيط هو العقد الأوسط: نصف هؤلاء المستأجرين يدفعون أكثر ونصفهم أقل. المساحة والطابق والإطلالة والمبنى كلها تحرّك السعر.',
    'No range yet: the open sources publish only the middle figure. Ranges arrive with contract-level data.': 'لا يوجد نطاق بعد: المصادر المفتوحة تنشر الرقم الأوسط فقط. تأتي النطاقات مع بيانات العقود التفصيلية.',
    'Data to {d} · updated {t} Kuwait time · new data is looked for three times a day': 'البيانات حتى {d} · حُدّثت {t} بتوقيت الكويت · يُبحث عن بيانات جديدة ثلاث مرات يوميًا',
    'of these contracts': 'من هذه العقود',
    'Map credits': 'مصادر الخريطة',
    'Typical rent per m²': 'الإيجار المعتاد لكل م²',
    'Typical gross yield': 'العائد الإجمالي المعتاد',
    'Typical sale price': 'سعر البيع المعتاد',
    'Place names in English and Arabic': 'أسماء الأماكن بالإنجليزية والعربية',
    'Kuwait time. New data is looked for three times a day.': 'بتوقيت الكويت. يُبحث عن بيانات جديدة ثلاث مرات يوميًا.',
    'Flats, any size': 'الشقق، بكل المساحات',
    'Below the first value: the lightest blue; above the last: the darkest': 'ما دون القيمة الأولى بأفتح أزرق، وما فوق الأخيرة بأغمقه',
    'of these contracts, in {n}': 'من هذه العقود، في {n}',
    'Area, e.g. JVC': 'المنطقة، مثلًا JVC',
    'Typical {aed} a year (average of the bedroom medians below) from ': 'المعتاد {aed} سنويًا (متوسط القيم الوسيطة حسب عدد الغرف أدناه) من ',
    'Unit': 'الوحدة',
    'Updated {t}': 'آخر تحديث {t}',
    'Villas': 'الفلل',
    'Weekly': 'أسبوعيًا',
    'What tenants actually pay for a home like yours, from registered contracts.': 'ما يدفعه المستأجرون فعلًا لمسكن مثل مسكنك، من العقود المسجلة.',
    'Which one?': 'أيها تقصد؟',
    'Yearly rent (AED)': 'الإيجار السنوي (درهم)',
    'You pay {rent} ({how})': 'تدفع {rent} ({how})',
    'You pay {rent}: <b>about the same as</b> the median.': 'تدفع {rent}: <b>تقريبًا مثل</b> الوسيط.',
    'You pay {rent}: <b>{pct}% above</b> the median ({diff} a year more).': 'تدفع {rent}: <b>أعلى من الوسيط بنسبة {pct}%</b> ({diff} سنويًا أكثر).',
    'You pay {rent}: <b>{pct}% below</b> the median ({diff} a year less).': 'تدفع {rent}: <b>أقل من الوسيط بنسبة {pct}%</b> ({diff} سنويًا أقل).',
    'Your lease renews today. Before agreeing a new rent, check what tenants pay for {what} in {area}.': 'يتجدد عقد إيجارك اليوم. قبل الاتفاق على إيجار جديد، راجع ما يدفعه المستأجرون مقابل {what} في {area}.',
    'Your saved areas have not changed.': 'لم تتغير مناطقك المحفوظة.',
    'Your yearly rent': 'إيجارك السنوي',
    'a year': 'سنويًا',
    'about the median': 'قريب من الوسيط',
    'average': 'متوسط',
    'avg': 'متوسط',
    'e.g. 75,000': 'مثلًا 75,000',
    'e.g. JVC, Business Bay, Al Qusais': 'مثلًا: JVC أو Business Bay أو Al Qusais',
    'homes': 'المساكن',
    'last 12 months': 'آخر 12 شهرًا',
    'last 12 months, to {d}': 'آخر 12 شهرًا، حتى {d}',
    'last success {t}': 'آخر نجاح {t}',
    'no change since saved': 'لا تغيير منذ الحفظ',
    'no figure now': 'لا رقم حاليًا',
    'not run yet': 'لم يعمل بعد',
    'saved': 'الحفظ',
    'the median is down {pct}% from {from} to {to}.': 'انخفض الوسيط {pct}% من {from} إلى {to}.',
    'the median is up {pct}% from {from} to {to}.': 'ارتفع الوسيط {pct}% من {from} إلى {to}.',
    'to {d}': 'حتى {d}',
    '{d} days before': 'قبل {d} يومًا',
    '{km} km, {s} less': '{km} كم، أقل بـ{s}',
    '{list} will appear once daily contract data is switched on.': 'ستظهر {list} عند تفعيل بيانات العقود اليومية.',
    '{n} contracts': '{n} عقد',
    '{pct}% above': 'أعلى بـ{pct}%',
    '{pct}% below': 'أقل بـ{pct}%',
    '{sign}{pct}% since you saved it': '{sign}{pct}% منذ حفظها',
    '{sign}{pct}% since {when}': '{sign}{pct}% منذ {when}',
    '{t} Kuwait time': '{t} بتوقيت الكويت',
    '{what} in view': '{what} في المنطقة المعروضة',
    '{what} in {area}': '{what} في {area}',
    '{what} in {area}: {aed} a year (median), from Ejari contracts.': '{what} في {area}: {aed} سنويًا (الوسيط)، من عقود إيجاري.',
  };

  function T(s, vars) {
    let out = LANG === 'ar' && Object.prototype.hasOwnProperty.call(AR, s) ? AR[s] : s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? '' : String(vars[k])));
    return out;
  }
  T.lang = LANG;
  T.locale = LANG === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB';
  T.AR = AR;
  T.STATIC = STATIC;

  // "9,810 contracts" / "9,810 عقود". Arabic counts: 1, 2, 3-10 (by the last two digits), 11 and up.
  const WORDS = {
    contract: ['عقد واحد', 'عقدان', 'عقود', 'عقدًا'],
    area: ['منطقة واحدة', 'منطقتان', 'مناطق', 'منطقة'],
  };
  T.count = (n, word) => {
    const num = Number(n).toLocaleString('en-AE');
    if (LANG !== 'ar' || !WORDS[word]) return num + ' ' + word + (n === 1 ? '' : 's');
    const [one, two, few, many] = WORDS[word], h = n % 100;
    return n === 1 ? one : n === 2 ? two : (h >= 3 && h <= 10 ? num + ' ' + few : num + ' ' + many);
  };

  // Home types are stored in English ("1-bedroom apartments"); this is how they are shown.
  T.unit = (u, short) => {
    if (!u) return T('All homes');
    const studio = /^Studios?$/i.test(u), m = /^(\d+)-bedroom (apartments?|villas?)$/i.exec(u);
    if (LANG !== 'ar') {
      if (!short) return u;
      return studio ? 'Studio' : m ? m[1] + ' bed' + (/villa/i.test(m[2]) ? ' villa' : '') : u;
    }
    if (studio) return short ? 'استوديو' : 'استوديوهات';
    if (!m) return T(u);
    const n = +m[1], villa = /villa/i.test(m[2]);
    const rooms = n === 1 ? 'غرفة نوم واحدة' : n === 2 ? 'غرفتا نوم' : n + ' غرف نوم';
    if (short) return rooms + (villa ? ' (فيلا)' : '');
    const kind = villa ? 'فلل' : 'شقق';
    return kind + (n === 1 ? ' بغرفة نوم' : n === 2 ? ' بغرفتي نوم' : ' بـ' + n + ' غرف نوم');
  };

  // "Villas, Commercial and Everything" / "الفلل، التجاري والكل".
  // Area names as shown: names registered all in capitals ("TOWN SQUARE") in title case ("Town Square"),
  // keeping acronyms and words with digits; others as registered. Search and storage keep the registered name.
  const ACRONYMS = new Set(['JLT', 'JVC', 'JVT', 'JBR', 'DIFC', 'DMCC', 'MBR', 'DSO', 'IMPZ', 'DIP', 'DHCC', 'DIC', 'DMC', 'UAE', 'II', 'III', 'IV', 'DXB']);
  T.place = name => {
    const n = String(name ?? '');
    if (!/[A-Z]{2}/.test(n) || /[a-z]/.test(n)) return n;
    return n.replace(/[A-Z][A-Z'’]*/g, w => ACRONYMS.has(w) ? w : w[0] + w.slice(1).toLowerCase());
  };
  T.list = items => items.length < 2 ? items.join('')
    : items.slice(0, -1).join(T(', ')) + (LANG === 'ar' ? ' و' : ' and ') + items[items.length - 1];

  T.set = lang => {
    try { root.localStorage.setItem('lang', lang); } catch (e) { /* this visit only */ }
    const u = new URL(root.location.href);
    u.searchParams.set('lang', lang);
    root.location.replace(u.href);
  };

  // Translate the page's fixed text and wire the language button.
  if (doc) {
    if (LANG === 'ar') {
      doc.title = 'أطلس دبي العقاري | إيجاري';
      doc.querySelectorAll('[data-t]').forEach(el => { const v = STATIC[el.dataset.t]; if (v) el.innerHTML = v; });
      doc.querySelectorAll('[data-t-ph]').forEach(el => { const v = STATIC[el.dataset.tPh]; if (v) el.placeholder = v; });
      doc.querySelectorAll('[data-t-aria]').forEach(el => { const v = STATIC[el.dataset.tAria]; if (v) el.setAttribute('aria-label', v); });
    }
    // Language switch in the header: both languages always shown, the current one highlighted.
    const sw = doc.getElementById('langSw');
    if (sw) {
      sw.setAttribute('aria-label', LANG === 'ar' ? 'اللغة' : 'Language');
      sw.querySelectorAll('button[data-l]').forEach(b => {
        const on = b.dataset.l === LANG;
        b.setAttribute('aria-pressed', String(on));
        b.title = b.dataset.l === 'ar' ? 'اقرأ هذه الصفحة بالعربية' : 'Read this page in English';
        b.addEventListener('click', () => { if (!on) T.set(b.dataset.l); });
      });
    }
  }
  return T;
});
