/** Original official-title presets (OfficialTitlePresetIds), Chinese titles. Six come from the
 * game's culture data (StreamingAssets/Base/Culture/<preset>/CultureData.json, OfficialTitles,
 * "<PoliticalSystem>|<OfficeId>" entries); 中性幻想 is OfficialTitlePresets.CreateNeutralPreset
 * (one title for every polity). Office order: Chancellor, Steward, Marshal, Governor,
 * DistrictGovernor, WarCommander. Generated from the game files; do not edit by hand. */
export const TITLE_OFFICES47=['Chancellor','Steward','Marshal','Governor','DistrictGovernor','WarCommander'] as const;
export type TitleOffice47=typeof TITLE_OFFICES47[number];
export const TITLE_POLITIES47=['Kingdom','Empire','Federation','Republic','Tribal','Theocracy'] as const;
export type TitlePolity47=typeof TITLE_POLITIES47[number];
export const TITLE_PRESETS47={
  EasternFantasy:{label:'东方幻想',titles:{Kingdom:["丞相", "大司农", "大司马", "太守", "刺史", "大将军"],Empire:["内阁首辅", "户部尚书", "兵部尚书", "知府", "总督", "经略"],Federation:["首席议政", "度支使", "都军使", "城守", "州牧", "联军都统"],Republic:["首席议政", "财政使", "兵政使", "县令", "郡守", "讨伐都督"],Tribal:["长老首席", "掌库人", "战酋", "寨落头人", "部族头领", "大统领"],Theocracy:["首席祭司", "圣库监", "护教大将军", "祭酒", "大祭酒", "护教军统帅"]}},
  WesternFantasy:{label:'西方幻想',titles:{Kingdom:["宰相", "王室财政大臣", "王家统帅", "城主", "总督", "最高统帅"],Empire:["帝国宰相", "财政总监", "帝国最高统帅", "城市执政官", "行省总督", "战地元帅"],Federation:["联邦宰相", "财政部长", "战争部长", "市长", "联邦州长", "盟军最高统帅"],Republic:["元老院首席", "财务官", "共和国将军", "市政官", "地方长官", "执政官统帅"],Tribal:["长老议长", "贡赋保管者", "战酋", "村寨头人", "氏族守护者", "战争领袖"],Theocracy:["枢机宰相", "什一税监", "信仰元帅", "堂区司铎", "地区主教", "圣战元帅"]}},
  NeutralFantasy:{label:'中性幻想',titles:{Kingdom:["首席大臣", "财政官", "军务统帅", "地方官", "区域长官", "战时统帅"],Empire:["首席大臣", "财政官", "军务统帅", "地方官", "区域长官", "战时统帅"],Federation:["首席大臣", "财政官", "军务统帅", "地方官", "区域长官", "战时统帅"],Republic:["首席大臣", "财政官", "军务统帅", "地方官", "区域长官", "战时统帅"],Tribal:["首席大臣", "财政官", "军务统帅", "地方官", "区域长官", "战时统帅"],Theocracy:["首席大臣", "财政官", "军务统帅", "地方官", "区域长官", "战时统帅"]}},
  Ciestundu:{label:'塞斯顿都官制',titles:{Kingdom:["石厅大法官", "矿税总管", "王国统军官", "堡主", "王领守堡官", "王师元帅"],Empire:["帝国石厅首席", "帝国铸币监", "帝国统军官", "石城守备", "山塞总督", "帝国元帅"],Federation:["诸堡首席议长", "诸堡司库", "诸堡统军官", "堡镇执政", "盟堡执政官", "誓盟元帅"],Republic:["石厅首席执政", "矿务铸币官", "民军统领", "矿市执政官", "堡城执政官", "公选元帅"],Tribal:["誓约长老", "炉贡保管者", "氏族战酋", "石寨头人", "氏族守堡官", "诸氏战酋"],Theocracy:["首席锻炉祭司", "圣矿什一监", "护炉军统领", "圣堂守卫官", "圣山守堡官", "圣炉团长"]}},
  Leffathou:{label:'莱法芙官制',titles:{Kingdom:["王冠首席之声", "王林总管", "王家长弓元帅", "树邑守望", "林地守望", "王命猎官"],Empire:["万叶大执政", "林产总监", "帝国长弓大元帅", "冠邑执政", "冠林总督", "帝国猎官"],Federation:["诸林首席之声", "林盟司库", "林盟长弓元帅", "林邑执事", "盟林守望", "盟约猎官"],Republic:["绿叶议会首席", "公林药库官", "公民长弓统帅", "绿荫市政官", "林邑执政官", "公推猎官"],Tribal:["长老环首席之声", "种籽粮仓守护", "首席猎手", "林寨头人", "林族长老", "战猎首领"],Theocracy:["初树神谕官", "供物药库祭司", "荆棘护教元帅", "圣树祭司", "圣林守望", "护教猎官"]}},
  Oeczea:{label:'奥克泽雅官制',titles:{Kingdom:["王廷首席议政", "海关铸币大臣", "王家大提督", "港务长", "王领港督", "王命远征提督"],Empire:["潮议院大执政", "帝国贸易总监", "帝国大提督", "港市执政", "海区总督", "帝国远征提督"],Federation:["诸港首席议长", "公账总管", "联盟舰队提督", "泊港总管", "港务执政官", "联军远征提督"],Republic:["首席执政官", "交易所财务官", "共和国舰队总长", "市舶官", "港城执政官", "战时远征提督"],Tribal:["船长议会首席", "贡货保管者", "海战酋长", "泊地头人", "港族首领", "诸舟远征提督"],Theocracy:["深海首席祭司", "圣库什一监", "圣舰队大提督", "港湾祭司", "潮汐主教", "潮汐远征提督"]}},
  Wristhos:{label:'莱斯索斯官制',titles:{Kingdom:["大帐断事官", "牧税总管", "万骑长", "帐落诺颜", "旗地诺颜", "王命统军使"],Empire:["大断事官", "商路监", "万户", "千户", "达鲁花赤", "征行都元帅"],Federation:["长老会首席之声", "金帐司库", "骑军都统", "帐城总管", "盟部诺颜", "会盟都元帅"],Republic:["议帐首席", "牧税商队财务官", "公民骑军总长", "帐市执政官", "营地执政官", "公推都元帅"],Tribal:["首席长老", "牧群保管者", "首席骑战酋", "营帐头人", "部族首领", "诸部战酋"],Theocracy:["长天代言祭司", "圣畜贡物保管者", "雷骑大元帅", "祭帐守护", "圣旗守护者", "长天都元帅"]}},
} as const satisfies Record<string,{label:string;titles:Record<TitlePolity47,readonly string[]>}>;
export type TitlePreset47=keyof typeof TITLE_PRESETS47;
/** The web's cultures are not the original's, so each gets the closest original preset:
 * East Asian cultures use 东方幻想, European ones 西方幻想, the rest 中性幻想. */
const CULTURE_PRESETS47:Record<string,TitlePreset47>={chinese:'EasternFantasy',japanese:'EasternFantasy',english:'WesternFantasy',roman:'WesternFantasy',french:'WesternFantasy',german:'WesternFantasy',greek:'WesternFantasy',slavic:'WesternFantasy',norse:'WesternFantasy'};
export const titlePreset47=(cultureId:string):TitlePreset47=>CULTURE_PRESETS47[cultureId]??'NeutralFantasy';
/** Title of an office for a nation's culture and polity (OfficialTitlePreset.TryGetTitle, falling
 * back to the neutral title as the original does). */
export function officeTitle47(cultureId:string,polity:string,office:TitleOffice47):string{
  const i=TITLE_OFFICES47.indexOf(office),preset=TITLE_PRESETS47[titlePreset47(cultureId)].titles as Record<string,readonly string[]>;
  return (preset[polity]??TITLE_PRESETS47.NeutralFantasy.titles.Kingdom)[i];
}
