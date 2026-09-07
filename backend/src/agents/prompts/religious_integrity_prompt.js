// Versioned deterministic review policy. No extra model call or hidden provider dependency.
export const prompt = Object.freeze({
  version: 'religious-integrity-v3.1',
  instructions: '출처와 인용을 대조하고 강요·비난·임상 진단·종파 일반화·종교 혼합·안전 지원 무시를 검토합니다. 문장 스타일이나 온건한 일반적 안내의 표현 차이만으로 거부하지 않습니다. 부정·유보·선택권 표현의 문맥을 고려합니다.',
});
export const integrityCategories = Object.freeze([
  'fabricated_quote', 'fabricated_source_ref', 'unsupported_scripture_quote',
  'sectarian_overgeneralization', 'interfaith_mixing', 'coercive_language',
  'shaming_language', 'clinical_diagnosis', 'safety_override', 'divine_authority', 'unsupported_absolute_claim',
]);

export const contentRules = Object.freeze([
  { category: 'divine_authority', patterns: [
    /(?:하나님|하느님|신|알라).{0,20}(?:직접|내게|저에게|당신에게).{0,20}(?:계시|명령|말씀하셨)/u,
    /(?:당신|사용자|이 상황|이 고통).{0,25}(?:하나님|하느님|신|알라)의\s*뜻(?:입니다|이다|이에요)/u,
    /(?:god|allah).{0,25}(?:told me|commands you|revealed to me)/iu,
  ] },
  { category: 'unsupported_absolute_claim', patterns: [
    /(?:기도|신앙|믿음|명상|수행).{0,20}(?:반드시|무조건|확실히).{0,20}(?:치유|완치|낫|구원)/u,
    /(?:유일한|절대적인)\s*(?:종교적 진리|구원의 방법|신의 뜻)/u,
  ] },
  { category: 'coercive_language', patterns: [
    /(?:반드시|무조건|당장|꼭).{0,25}(?:개종|복종|믿어야|기도해야|예배해야|수행해야)/u,
    /(?:개종|복종)(?:해야|하셔야|하십시오|하세요)/u,
    /(?:must|have to)\s+(?:convert|obey|believe)/iu,
  ] },
  { category: 'shaming_language', patterns: [
    /(?:고통|불행|괴로움|아픔|병).{0,25}(?:업보|믿음|신앙|죄|벌).{0,16}(?:탓|부족|때문|대가)/u,
    /(?:믿음|신앙)이?\s*부족해서/u,
    /(?:다른 종교|타종교|불신자).{0,15}(?:열등|미개|악하|쓰레기)/u,
    /(?:suffering|pain).{0,30}(?:your fault|lack of faith|punishment)/iu,
  ] },
  { category: 'clinical_diagnosis', patterns: [
    /(?:당신|사용자|당신의 증상).{0,20}(?:우울증|조현병|공황장애|양극성장애|불안장애|정신병)(?:입니다|이에요|이네요|이 확실|에 걸렸)/u,
    /(?:우울증|조현병|공황장애|양극성장애)(?:으로|로)\s*(?:진단합니다|확진합니다)/u,
    /you (?:have|suffer from) (?:clinical depression|schizophrenia|bipolar disorder)/iu,
  ] },
  { category: 'safety_override', patterns: [
    /(?:약|약물|치료|상담|진료)(?:을|를|은|는)?\s*(?:끊|중단(?:하|해)|그만(?:두|하)|필요 없)/u,
    /(?:기도|명상|수행)만\s*(?:하세요|하시면 됩니다|하면 됩니다)/u,
    /(?:응급실|병원|의사|전문가|119|112|109).{0,16}(?:가지 마|연락하지 마|도움.{0,5}필요 없|필요 없|찾지 마)/u,
    /(?:기도|명상|수행)만\s*(?:하면|으로).{0,20}(?:낫|해결|충분)/u,
    /(?:위험|자살|자해).{0,10}(?:무시|신경 쓰지)/u,
    /(?:do not|don't) (?:call|seek|contact).{0,15}(?:emergency|doctor|help)/iu,
  ] },
  { category: 'sectarian_overgeneralization', patterns: [
    /(?:모든|전체)\s*(?:개신교|가톨릭|불교|유대교|무슬림|이슬람|힌두교|유교|신자).{0,35}(?:반드시|유일한|오직|같은 법학파|동일한 교리)/u,
    /(?:우리|이|특정)\s*(?:교단|종파|학파|법학파)만.{0,20}(?:정답|옳|진리)/u,
    /유교는\s*(?:단순히\s*)?(?:철학|종교)일 뿐/u,
    /all (?:muslims|buddhists|hindus|jews|christians).{0,20}(?:must|only|same doctrine)/iu,
  ] },
]);

// Detect affirmative replacement of one tradition by another, not mere mention/comparison.
export const interfaithRules = Object.freeze({
  jewish: [/(?:유대교|유대인).{0,25}예수.{0,20}(?:메시아|구세주|구원자)/u, /judaism.{0,25}jesus.{0,20}(?:messiah|savior)/iu],
  buddhist: [/(?:불교|불자).{0,25}(?:예수|하나님).{0,20}(?:구세주|창조주|믿어야|구원)/u],
  islamic: [/(?:이슬람|무슬림).{0,25}(?:삼위일체|예수는 하나님|예수를 하나님)/u],
  catholic: [/가톨릭.{0,25}오직 성경만.{0,20}(?:교리|정답|믿)/u],
  protestant: [/개신교.{0,25}(?:꾸란|쿠란).{0,20}(?:유일한 경전|최고 권위)/u],
  hindu: [/힌두교.{0,25}예수.{0,20}(?:유일한 구세주|유일한 구원자)/u],
  confucian: [/유교.{0,25}예수.{0,20}(?:유일한 구세주|유일한 구원자)/u],
});

export const scriptureMarker = /성경|꾸란|쿠란|코란|하디스|경전|타나크|토라|논어|맹자|법구경|금강경|반야심경|바가바드|우파니샤드|베다|bible|quran|koran|hadith|scripture|torah|tanakh|analects|sutra/iu;
export const scriptureAttribution = /(?:성경|꾸란|쿠란|코란|하디스|경전|타나크|토라|논어|맹자|법구경|금강경|바가바드\s*기타)(?:은|는|에|에서).{0,15}(?:말|따르|가르|이르|기록|구절|인용)|(?:교도권|공식 교리)(?:은|는|에|로).{0,25}(?:따르|단정|정해|가르|선언)|(?:bible|quran|torah|scripture) (?:says|teaches)/iu;
export const scriptureReference = /(?:창세기|시편|잠언|마태복음|마가복음|누가복음|요한복음|로마서|빌립보서|이사야|꾸란|쿠란|코란|논어|맹자|법구경|[1-3]?\s*(?:John|Psalm|Romans|Quran))\s*\d+\s*[:장]\s*\d+/iu;
