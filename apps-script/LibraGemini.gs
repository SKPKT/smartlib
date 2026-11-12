// Server only. Gemini credentials never leave Script Properties or the Google API auth header.
const LIBRA_GEMINI_RECOMMENDED = 'gemini-3.5-flash-lite';
const LIBRA_BACKEND_REVISION = 'libra-gemini-v2';

function libraGeminiSettings(props) {
  const key = String(props.getProperty('GEMINI_API_KEY') || '').trim();
  const requested = String(props.getProperty('LIBRA_GEMINI_MODEL') || '').trim().replace(/^models\//, '');
  const model = /^gemini-[a-z0-9][a-z0-9.-]{0,89}$/.test(requested) && !requested.includes('..') ? requested : '';
  const code = !key ? 'MISSING_KEY' : !requested ? 'MISSING_MODEL' : !model ? 'MODEL_FORMAT' : '';
  return {key, model, code};
}

function libraGeminiError(code, http) {
  return Object.assign(new Error(code), {libraCode:code,http:http||0});
}

function libraGeminiDiagnostic(config, error) {
  const code = error ? error.libraCode || 'INTERNAL' : config.code;
  const messages = {
    MISSING_KEY:'Script Property GEMINI_API_KEY tidak ditemui.',
    MISSING_MODEL:'Tetapkan Script Property LIBRA_GEMINI_MODEL, contohnya '+LIBRA_GEMINI_RECOMMENDED+'.',
    MODEL_FORMAT:'Format LIBRA_GEMINI_MODEL tidak sah. Semak ID model; cadangan: '+LIBRA_GEMINI_RECOMMENDED+'.',
    MODEL_UNAVAILABLE:'Model tidak tersedia untuk projek ini atau tidak menyokong generateContent.',
    INVALID_KEY:'Gemini menolak API key. Semak key dan sekatan projek.',
    ACCESS_DENIED:'Gemini menolak akses (HTTP 401/403). Semak sekatan key dan akses projek.',
    BAD_REQUEST:'Gemini menolak format permintaan (HTTP 400).',
    QUOTA:'Kuota Gemini telah dicapai. Semak penggunaan dan kuota projek.',
    RATE_LIMIT:'Had kadar Gemini telah dicapai. Cuba semula kemudian.',
    SERVICE_UNAVAILABLE:'Perkhidmatan Gemini tergendala (HTTP 5xx). Cuba semula kemudian.',
    TIMEOUT:'Permintaan Gemini tamat masa.',
    NETWORK:'Sambungan ke Gemini gagal.',
    INVALID_JSON:'Gemini dihubungi tetapi respons JSON tidak sah.',
    RESPONSE_INCOMPLETE:'Gemini tidak memulangkan respons lengkap.',
    RESPONSE_BLOCKED:'Gemini menyekat respons bagi permintaan ini.',
    SCHEMA:'Respons Gemini tidak memenuhi format atau semakan yang diperlukan.',
    HTTP:'Permintaan Gemini gagal.',
    INTERNAL:'Semakan Gemini gagal dalam Apps Script.'
  };
  const state = code ? (['MISSING_KEY','MISSING_MODEL'].includes(code) ? 'disabled' : 'error') : 'configured';
  return {state,configured:!config.code,code:code||'',model:config.model,
    suggestedModel:LIBRA_GEMINI_RECOMMENDED,http:error?.http||0,message:messages[code]||'Gemini dikonfigurasi — sambungan belum disahkan.'};
}

function libraGeminiCache(config, scope) {
  if (config.code) return '';
  return 'libra_gemini_v2_'+scope+'_'+Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,config.model+'\n'+config.key)).slice(0,36);
}

function libraGeminiHealth(config, result) {
  if (config.code) return null;
  try {
    const cache = CacheService.getScriptCache(), key = libraGeminiCache(config,'health');
    if (!result) return JSON.parse(cache.get(key)||'null');
    cache.put(key,JSON.stringify(result),result.state==='connected'?180:60);
  } catch (_) { /* Cache failure must not prevent LIBRA from working. */ }
  return null;
}

function libraGeminiHttp(config, suffix, payload) {
  let res;
  try {
    res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(config.model)+suffix,{
      method:payload?'post':'get',muteHttpExceptions:true,followRedirects:false,
      headers:{'x-goog-api-key':config.key},
      ...(payload?{contentType:'application/json',payload:JSON.stringify(payload)}:{})
    });
  } catch (error) {
    throw libraGeminiError(/timed?\s*out|timeout|deadline/i.test(String(error?.message||''))?'TIMEOUT':'NETWORK');
  }
  const http=res.getResponseCode();
  let body;
  try {body=JSON.parse(res.getContentText());} catch (_) {
    if (http>=200 && http<300) throw libraGeminiError('INVALID_JSON',http);
  }
  if (http>=200 && http<300) return body;
  // Inspect provider details only in memory. Never return raw messages, payloads or URLs.
  const details=body?.error?.details;
  const reasons=Array.isArray(details)?details.map(d=>String(d?.reason||'')).join(' '):'';
  const msg=String(body?.error?.message||'');
  const code=/API_KEY_(?:INVALID|EXPIRED)|API key not valid/i.test(reasons+' '+msg)?'INVALID_KEY':
    http===404?'MODEL_UNAVAILABLE':
    http===401||http===403?'ACCESS_DENIED':
    http===429?(/rate.limit|per.minute|per.second|requestsperminute|tokensperminute|requestspersecond/i.test(reasons+' '+msg+' '+JSON.stringify(details||[]))?'RATE_LIMIT':'QUOTA'):
    http===408||http===504?'TIMEOUT':http>=500?'SERVICE_UNAVAILABLE':http===400?'BAD_REQUEST':'HTTP';
  throw libraGeminiError(code,http);
}

function libraGeminiModel(config) {
  let cache, key, model;
  try {
    cache=CacheService.getScriptCache();key=libraGeminiCache(config,'model');model=JSON.parse(cache.get(key)||'null');
  } catch (_) { /* Validate with Models API if cache unavailable. */ }
  if (model) return model;
  const info=libraGeminiHttp(config,'');
  if (!Array.isArray(info?.supportedGenerationMethods) || !info.supportedGenerationMethods.includes('generateContent')) throw libraGeminiError('MODEL_UNAVAILABLE');
  model={outputLimit:Number(info.outputTokenLimit)||0};
  try {if (key) cache.put(key,JSON.stringify(model),600);} catch (_) {}
  return model;
}

function libraGeminiMatches(value, schema) {
  if (schema.type==='OBJECT') return !!value && typeof value==='object' && !Array.isArray(value) &&
    (schema.required||[]).every(key=>Object.prototype.hasOwnProperty.call(value,key)) &&
    Object.keys(schema.properties).every(key=>!Object.prototype.hasOwnProperty.call(value,key)||libraGeminiMatches(value[key],schema.properties[key]));
  if (schema.type==='ARRAY') return Array.isArray(value) && value.length>=(schema.minItems||0) &&
    value.length<=(schema.maxItems??Infinity) && value.every(item=>libraGeminiMatches(item,schema.items));
  if (schema.type==='STRING') return typeof value==='string' && (!schema.enum||schema.enum.includes(value));
  if (schema.type==='NUMBER') return typeof value==='number' && Number.isFinite(value);
  return false;
}

function libraGeminiAttempt(props, instruction, evidence, fields, options) {
  const config=libraGeminiSettings(props);
  const attempts=options?.retry?2:1;
  let failure;
  for(let i=0;i<attempts;i++){
    try {
      let value=libraGemini(props,instruction+(i?' Balas dengan JSON lengkap mengikut skema. Ringkaskan setiap butir.':''),evidence,fields,options?.tokens);
      if(options?.validate) value=options.validate(value);
      if(value==null) throw libraGeminiError('SCHEMA');
      const ai={...libraGeminiDiagnostic(config),state:'connected',message:'Gemini AI tersedia.',checkedAt:new Date().toISOString()};
      libraGeminiHealth(config,ai);return {value,ai};
    } catch(error) {
      failure=error;
      if(!['SCHEMA','INVALID_JSON','RESPONSE_INCOMPLETE'].includes(error.libraCode)) break;
    }
  }
  const ai=libraGeminiDiagnostic(config,failure);
  if(config.code) return {value:null,ai};
  ai.checkedAt=new Date().toISOString();libraGeminiHealth(config,ai);
  return {value:null,ai};
}

function libraGeminiStatus(props, check) {
  const config=libraGeminiSettings(props);
  if(config.code) return libraGeminiDiagnostic(config);
  const cached=libraGeminiHealth(config);
  if(!check || cached) return cached||libraGeminiDiagnostic(config);
  return libraGeminiAttempt(props,'Ujian sambungan. Balas nilai status: ok sahaja.',{test:true},
    {status:{type:'STRING',enum:['ok']}},{tokens:1024}).ai;
}

// Run manually from the Apps Script editor. This is not exposed by the web-app router.
// A configured model is never replaced; a missing model is saved only after a successful real probe.
function libraVerifyGeminiSetup() {
  const props=PropertiesService.getScriptProperties();
  let settings=libraGeminiSettings(props), saved=false;
  if(settings.code==='MISSING_MODEL') {
    const probeProps={getProperty:key=>key==='LIBRA_GEMINI_MODEL'?LIBRA_GEMINI_RECOMMENDED:props.getProperty(key)};
    const proposed=libraGeminiStatus(probeProps,true);
    if(proposed.state!=='connected'){console.log(JSON.stringify({probe:proposed,modelSaved:false}));return;}
    const lock=LockService.getScriptLock();lock.waitLock(3000);
    try {
      if(!String(props.getProperty('LIBRA_GEMINI_MODEL')||'').trim()&&libraGeminiSettings(probeProps).key===settings.key) {
        props.setProperty('LIBRA_GEMINI_MODEL',LIBRA_GEMINI_RECOMMENDED);saved=true;
      }
    } finally {lock.releaseLock();}
    settings=libraGeminiSettings(props);
  }
  const probe=libraGeminiStatus(props,true);
  console.log(JSON.stringify({revision:LIBRA_BACKEND_REVISION,modelSaved:saved,probe}));
  if(probe.state!=='connected')return;
  try {
    const advisor=libraAdvice({query:'027.8'},props);
    console.log(JSON.stringify({action:'libra_advice',method:advisor.method,ddc:advisor.recommendation?.nombor_ddc||null,diagnostic:advisor.gemini?.code||null}));
  } catch (_) {console.log(JSON.stringify({action:'libra_advice',diagnostic:'CATALOGUE_CHECK_FAILED'}));}
  for(const count of [1,10]){
    const plan=libraPlanPrograms({program_type:'Galakan Membaca',audience:'Semua Murid',needs:'Umum',duration:'Sehari',budget:'Tiada Kos',count},props);
    console.log(JSON.stringify({action:'libra_plan',requested:count,count:plan.programs.length,method:plan.method,diagnostic:plan.gemini.code||null}));
  }
}
