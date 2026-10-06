import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {parseContentCsv} from './fms-content-pack.mjs';

/** Read only these 36 shipped content files. No directory enumeration, game
 * execution, settings, saves, SDK or credentials. Caller writes reviewed output. */
export const NAMING_CULTURES=['Ciestundu','EasternFantasy','Leffathou','Oeczea','WesternFantasy','Wristhos'];
const tables={states:'StateNames.csv',cities:'CityNames.csv',male:'CharacterFirstNames_Male.csv',female:'CharacterFirstNames_Female.csv',surnames:'CharacterLastNames.csv'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function buildNativeNamingData(source){
 if(!path.isAbsolute(source))throw Error('Explicit absolute installation path required');
 const root=fs.realpathSync(source),base=path.join(root,'FantasyMapSimulator_Data/StreamingAssets/Base/Culture');
 const sources=[],cultures=[];let totalBytes=0;
 function read(id,file){
  const target=path.join(base,id,file),real=fs.realpathSync(target),relative=path.relative(root,real);
  if(relative.startsWith('..')||path.isAbsolute(relative)||real!==target)throw Error('Content path redirected');
  const stat=fs.statSync(target);if(!stat.isFile()||stat.size>2*1024*1024)throw Error('Content size/type rejected');
  const bytes=fs.readFileSync(target);totalBytes+=bytes.length;
  if(bytes.length!==stat.size||totalBytes>4*1024*1024)throw Error('Content changed or total budget exceeded');
  sources.push({path:`Base/Culture/${id}/${file}`,sha256:sha(bytes),bytes:bytes.length});
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
 }
 for(const id of NAMING_CULTURES){
  const definition=JSON.parse(read(id,'CultureData.json'));
  if(!['FirstNameFirst','LastNameFirst'].includes(definition.NameOrder))throw Error('Unrecognized NameOrder');
  const culture={id,nameOrder:definition.NameOrder==='LastNameFirst'?1:0,languages:[],tables:{}};
  for(const [kind,file] of Object.entries(tables)){
   const {header,rows,ignoredUnnamedColumns}=parseContentCsv(read(id,file));
   if(ignoredUnnamedColumns.length||header[0]!=='Key'||rows.length>4096||new Set(rows.map(r=>r[0])).size!==rows.length)throw Error('Unreviewed naming CSV structure');
   const languages=header.slice(1);
   if(culture.languages.length&&JSON.stringify(languages)!==JSON.stringify(culture.languages))throw Error('Language columns differ');
   if(rows.some(row=>!row[0]||row.some(value=>value.length>160||[...value].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))))throw Error('Unreviewed naming cell');
   culture.languages=languages;culture.tables[kind]=rows;
  }
  cultures.push(culture);
 }
 return {cultures,manifest:{version:1,format:'fms-native-naming-data',sources,normalization:'CSV decoding only; original row/column order, whitespace and duplicate display names retained. No source configuration included.',counts:cultures.map(c=>({id:c.id,languages:c.languages.length,...Object.fromEntries(Object.entries(c.tables).map(([k,v])=>[k,v.length]))}))}};
}
