const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const now=()=>new Date().toISOString();
const text=(value,fallback='')=>typeof value==='string'?value.trim():fallback;
const setupError=()=>json({ok:false,error:'setup-required',message:'Cloudflare D1 has not been connected to Kitchen yet.'},503);
async function body(request){if(!(request.headers.get('content-type')||'').includes('application/json'))throw new Error('Expected JSON request body');return request.json()}

async function shopping(request,env){
 if(!env.DB)return setupError();
 if(request.method==='GET'){
  const result=await env.DB.prepare('SELECT * FROM shopping_items ORDER BY checked ASC, COALESCE(shop,\'\'), created_at DESC').all();
  return json({ok:true,items:result.results||[]});
 }
 if(request.method==='POST'){
  const input=await body(request);const name=text(input.name);if(!name)return json({ok:false,error:'validation',message:'Item name is required.'},400);
  const id=crypto.randomUUID(),stamp=now();
  await env.DB.prepare('INSERT INTO shopping_items (id,name,quantity,shop,category,checked,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)').bind(id,name,text(input.quantity),text(input.shop),text(input.category),stamp,stamp).run();
  return json({ok:true,id},201);
 }
 return json({ok:false,error:'method-not-allowed'},405);
}
async function shoppingItem(request,env,id){
 if(!env.DB)return setupError();
 if(request.method==='PATCH'){
  const input=await body(request);const current=await env.DB.prepare('SELECT * FROM shopping_items WHERE id=?').bind(id).first();if(!current)return json({ok:false,error:'not-found'},404);
  await env.DB.prepare('UPDATE shopping_items SET name=?,quantity=?,shop=?,category=?,checked=?,updated_at=? WHERE id=?').bind(text(input.name??current.name),text(input.quantity??current.quantity),text(input.shop??current.shop),text(input.category??current.category),input.checked==null?Number(current.checked):(input.checked?1:0),now(),id).run();
  return json({ok:true});
 }
 if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM shopping_items WHERE id=?').bind(id).run();return json({ok:true});}
 return json({ok:false,error:'method-not-allowed'},405);
}

async function meals(request,env,url){
 if(!env.DB)return setupError();
 if(request.method==='GET'){
  const from=url.searchParams.get('from')||new Date().toISOString().slice(0,10);const to=url.searchParams.get('to')||'9999-12-31';
  const result=await env.DB.prepare('SELECT * FROM meals WHERE meal_date BETWEEN ? AND ? ORDER BY meal_date, CASE meal_type WHEN \'Breakfast\' THEN 0 WHEN \'Lunch\' THEN 1 ELSE 2 END').bind(from,to).all();return json({ok:true,meals:result.results||[]});
 }
 if(request.method==='POST'){
  const input=await body(request);const title=text(input.title);if(!title||!input.meal_date)return json({ok:false,error:'validation',message:'Meal and date are required.'},400);const id=crypto.randomUUID(),stamp=now();
  await env.DB.prepare('INSERT INTO meals (id,meal_date,meal_type,title,recipe_id,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,input.meal_date,text(input.meal_type,'Dinner')||'Dinner',title,input.recipe_id||null,text(input.notes),stamp,stamp).run();return json({ok:true,id},201);
 }
 return json({ok:false,error:'method-not-allowed'},405);
}
async function mealById(request,env,id){if(!env.DB)return setupError();if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM meals WHERE id=?').bind(id).run();return json({ok:true})}return json({ok:false,error:'method-not-allowed'},405)}

async function recipes(request,env,url){
 if(!env.DB)return setupError();
 if(request.method==='GET'){
  const q=text(url.searchParams.get('q')).toLowerCase();let result;if(q){const like=`%${q}%`;result=await env.DB.prepare('SELECT * FROM recipes WHERE LOWER(name) LIKE ? OR LOWER(ingredients) LIKE ? ORDER BY favourite DESC,name').bind(like,like).all()}else result=await env.DB.prepare('SELECT * FROM recipes ORDER BY favourite DESC,name').all();return json({ok:true,recipes:result.results||[]});
 }
 if(request.method==='POST'){
  const input=await body(request);const name=text(input.name);if(!name)return json({ok:false,error:'validation',message:'Recipe name is required.'},400);const id=crypto.randomUUID(),stamp=now();await env.DB.prepare('INSERT INTO recipes (id,name,ingredients,instructions,source,favourite,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,name,text(input.ingredients),text(input.instructions),text(input.source),input.favourite?1:0,stamp,stamp).run();return json({ok:true,id},201);
 }
 return json({ok:false,error:'method-not-allowed'},405);
}

async function pantry(request,env){
 if(!env.DB)return setupError();
 if(request.method==='GET'){const result=await env.DB.prepare('SELECT *, CASE WHEN low_stock_at IS NOT NULL AND quantity IS NOT NULL AND quantity <= low_stock_at THEN 1 ELSE 0 END AS low_stock FROM pantry_items ORDER BY low_stock DESC,name').all();return json({ok:true,items:result.results||[]})}
 if(request.method==='POST'){
  const input=await body(request);const name=text(input.name);if(!name)return json({ok:false,error:'validation',message:'Pantry item name is required.'},400);const id=crypto.randomUUID(),stamp=now();const numberOrNull=(v)=>v===''||v==null?null:Number(v);await env.DB.prepare('INSERT INTO pantry_items (id,name,quantity,unit,location,low_stock_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,name,numberOrNull(input.quantity),text(input.unit),text(input.location),numberOrNull(input.low_stock_at),stamp,stamp).run();return json({ok:true,id},201);
 }
 return json({ok:false,error:'method-not-allowed'},405);
}
async function pantryById(request,env,id){if(!env.DB)return setupError();if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM pantry_items WHERE id=?').bind(id).run();return json({ok:true})}return json({ok:false,error:'method-not-allowed'},405)}

async function dashboard(env){
 if(!env.DB)return setupError();const today=new Date().toISOString().slice(0,10);const horizon=new Date(Date.now()+6*86400000).toISOString().slice(0,10);
 const [shoppingResult,mealResult,lowResult,recipeCount]=await Promise.all([
  env.DB.prepare('SELECT * FROM shopping_items WHERE checked=0 ORDER BY created_at DESC LIMIT 8').all(),
  env.DB.prepare('SELECT * FROM meals WHERE meal_date BETWEEN ? AND ? ORDER BY meal_date LIMIT 14').bind(today,horizon).all(),
  env.DB.prepare('SELECT * FROM pantry_items WHERE low_stock_at IS NOT NULL AND quantity IS NOT NULL AND quantity <= low_stock_at ORDER BY name LIMIT 8').all(),
  env.DB.prepare('SELECT COUNT(*) AS count FROM recipes').first()
 ]);
 return json({ok:true,shopping:shoppingResult.results||[],meals:mealResult.results||[],low_stock:lowResult.results||[],recipe_count:Number(recipeCount?.count||0)});
}

export default{async fetch(request,env){const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);try{
 if(url.pathname==='/api/health')return json({ok:true,db:Boolean(env.DB)});
 if(url.pathname==='/api/dashboard'&&request.method==='GET')return dashboard(env);
 if(url.pathname==='/api/shopping')return shopping(request,env);
 if(url.pathname==='/api/meals')return meals(request,env,url);
 if(url.pathname==='/api/recipes')return recipes(request,env,url);
 if(url.pathname==='/api/pantry')return pantry(request,env);
 let m=url.pathname.match(/^\/api\/shopping\/([^/]+)$/);if(m)return shoppingItem(request,env,m[1]);
 m=url.pathname.match(/^\/api\/meals\/([^/]+)$/);if(m)return mealById(request,env,m[1]);
 m=url.pathname.match(/^\/api\/pantry\/([^/]+)$/);if(m)return pantryById(request,env,m[1]);
 return json({ok:false,error:'not-found'},404);
 }catch(error){console.error(JSON.stringify({app:'kitchen',path:url.pathname,error:error instanceof Error?error.message:String(error)}));return json({ok:false,error:'request-failed',message:error instanceof Error?error.message:'Request failed.'},500)}}};
