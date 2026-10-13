/* 扬扬成长助手 v1 — 纯前端，本地存储。无用户信息上传。 */
(() => {
  'use strict';
  const KEY = 'yangyang-care-data-v1';
  const DEFAULT = { version: 1, profile: { name: '扬扬', birthday: '2026-07-21' }, settings: { reminderOn: false, intervalMin: 180, advanceMin: 10 }, records: [] };
  const copy = v => JSON.parse(JSON.stringify(v));
  let state = load();
  let tab = 'home', historyDay = localDate(), historyFilter = 'all';
  let modalType = null, modalId = null, pendingType = 'wet', toastTimer = null;
  let lastUndo = null;
  const root = document.getElementById('app');
  const nav = document.getElementById('nav');
  const modalHost = document.getElementById('modalHost');
  const toastHost = document.getElementById('toastHost');

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!data || !Array.isArray(data.records)) return copy(DEFAULT);
      return {
        version: 1,
        profile: { ...DEFAULT.profile, ...(data.profile || {}) },
        settings: { ...DEFAULT.settings, ...(data.settings || {}) },
        records: data.records.filter(validRecord)
      };
    } catch (err) {
      console.warn('本地数据读取失败', err);
      return copy(DEFAULT);
    }
  }
  function save() {
    try {localStorage.setItem(KEY, JSON.stringify(state)); return true;}
    catch (err) {toast('存储失败：请导出备份并检查浏览器空间'); return false;}
  }
  function localDate(date = new Date()) {const d = date; return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function localDateTime(date = new Date()) {return `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}
  function pad(n) {return String(n).padStart(2, '0');}
  function parseAt(v) {return new Date(v);}
  function clock(v) {return v?.slice(11,16) || '--:--';}
  function addDays(day,n) {const d=new Date(day+'T12:00'); d.setDate(d.getDate()+n); return localDate(d);}
  function displayDay(day) {const d = new Date(day+'T12:00');return `${d.getMonth()+1}月${d.getDate()}日` ;}
  function fmtDateTime(v) {return v.replace('T', ' ');}
  function ageText() {
    const b=new Date(state.profile.birthday+'T12:00'), t=new Date(localDate()+'T12:00');
    const days=Math.floor((t-b)/86400000);
    return Number.isFinite(days)&&days>=0 ? `出生第 ${days+1} 天` : '成长记录';
  }
  function htmlSafe(v) {return String(v??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function timeStamp(r) {return parseAt(r.at).getTime();}
  function validRecord(r) {
    if (!r || typeof r!=='object'|| !['feed','diaper','care'].includes(r.type) || typeof r.at!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(r.at) || !Number.isFinite(Date.parse(r.at)))return false;
    if(r.type==='feed' && (!Number.isFinite(Number(r.amount)) || Number(r.amount)<0 || Number(r.amount)>3000 || (r.extra!==undefined && (!Number.isFinite(Number(r.extra)) || Number(r.extra)<0 || Number(r.extra)>3000)) || Number(r.amount)+Number(r.extra||0)>3000))return false;
    return true;
  }
  function records() {return [...state.records].sort((a,b)=>timeStamp(b)-timeStamp(a));}
  function onDay(day) {return state.records.filter(r=>r.at.slice(0,10)===day);}
  function volume(rs) {return rs.filter(r=>r.type==='feed').reduce((n,r)=>n+(Number(r.amount)||0)+(Number(r.extra)||0),0);}
  function countDiaper(rs,kind) {return rs.filter(r=>r.type==='diaper'&&(kind==='wet'?['wet','both'].includes(r.diaperType):['dirty','both'].includes(r.diaperType))).length;}
  function fmtDuration(minutes) {
    if (!Number.isFinite(minutes))return '--';
    const m=Math.max(0,Math.floor(minutes));return m>=60?`${Math.floor(m/60)}小时${m%60?m%60+'分':''}`:`${m}分钟`;
  }
  function recentFeed() {const now=Date.now();return records().find(r=>r.type==='feed'&&timeStamp(r)<=now);}
  function nextReminder() {const r=recentFeed();if(!r || !state.settings.reminderOn)return null;return timeStamp(r)+Number(state.settings.intervalMin)*60000;}
  function reminderMarkup() {
    const r=recentFeed(), next=nextReminder();
    let main,desc;
    if (!state.settings.reminderOn) {main='提醒未开启';desc='可在设置中开启页面内喂奶倒计时提醒';}
    else if (!r){main='等待首次记录';desc='记录第一次喂奶后，自动计算下一次提醒';}
    else {
      const delta=Math.ceil((next-Date.now())/60000);
      main=delta<0?'已到提醒时间':fmtDuration(delta);
      desc=`预计 ${clock(localDateTime(new Date(next)))} · 按家长设置的 ${fmtDuration(Number(state.settings.intervalMin))} 间隔计算`;
    }
    return `<div class="remind"><div class="r-top"><span>◷ 下一次喂奶提醒</span><button data-action="settings">调整提醒</button></div><div class="r-main" data-live-countdown>${main}</div><div class="r-sub" data-live-description>${desc}</div></div>`;
  }
  function eventInfo(r) {
    if (r.type==='feed'){
      const total=(Number(r.amount)||0)+(Number(r.extra)||0);
      const source={'formula':'配方奶','expressed':'瓶喂母乳','breastfeeding':'亲喂母乳','mixed':'混合喂养'}[r.feedType]||'喂奶';
      return {icon:'🍼', label:`${source}${total>0?' · '+total+' ml':''}`, detail:[r.extra>0?`基础 ${r.amount||0} + 补喂 ${r.extra} ml`:null,r.feedType==='breastfeeding'&&total===0?'未填写奶量':null,r.note].filter(Boolean).join(' · ')};
    }
    if(r.type==='diaper'){
      const label={'wet':'尿尿','dirty':'便便','both':'尿尿 + 便便'}[r.diaperType]||'尿布';
      return {icon:r.diaperType==='wet'?'💧':'🧷',label,detail:[r.stoolColor,r.stoolTexture,r.stoolAmount,r.note].filter(Boolean).join(' · ')};
    }
    return {icon:'🌿',label:r.careTitle||'其他护理',detail:r.note||''};
  }
  function eventList(rs, emptyText='还没有记录，点击上方按钮添加第一条吧') {
    const sorted=[...rs].sort((a,b)=>timeStamp(b)-timeStamp(a));
    if(!sorted.length)return `<div class="empty"><div class="em">🌱</div>${emptyText}</div>`;
    return sorted.map(r=>{
      const info=eventInfo(r);const classes=r.type==='feed'?'feed':r.type==='diaper'?'diaper':'care';
      return `<div class="event"><div class="event-icon ${classes}">${info.icon}</div><div class="event-body"><div class="event-head"><strong>${htmlSafe(info.label)}</strong><time>${clock(r.at)}</time></div><p>${htmlSafe(info.detail || (r.verified===false?'待核对记录':'已保存'))}${r.verified===false?' · 待核对':''}</p></div><button class="tiny-action" data-action="edit" data-id="${htmlSafe(r.id)}" aria-label="编辑记录">编辑 ›</button></div>`;
    }).join('');
  }
  function navMarkup() {
    const tabs=[['home','⌂','首页'],['history','▦','历史'],['stats','▥','统计'],['settings','⚙','设置']];
    nav.innerHTML=tabs.map(([key,ico,label])=>`<button class="nav-item ${tab===key?'active':''}" data-action="tab" data-tab="${key}" aria-current="${tab===key?'page':'false'}"><span class="nav-ico">${ico}</span><span>${label}</span></button>`).join('');
  }
  function homeMarkup() {
    const day=localDate(), today=onDay(day), past24=state.records.filter(r=>timeStamp(r)>Date.now()-86400000&&timeStamp(r)<=Date.now());
    const last=recentFeed();
    return `<header class="hero"><div class="topline"><div><div class="eyebrow">BABY CARE JOURNAL</div><h1>${htmlSafe(state.profile.name)}成长助手 ✨</h1><p>${displayDay(day)} · ${ageText()}</p></div><div class="avatar">👶</div></div></header>
      ${reminderMarkup()}
      <section class="section"><h2 class="section-title">今天的成长记录 <small>按自然日统计</small></h2><div class="cards">
      <div class="card"><div class="card-label">🍼 今日奶量</div><div class="metric">${volume(today)}<small> ml</small></div><div class="sub">${today.filter(r=>r.type==='feed').length} 次喂奶 · 不含未知量</div></div>
      <div class="card"><div class="card-label">🌤 过去24小时</div><div class="metric">${volume(past24)}<small> ml</small></div><div class="sub">最近一次：${last?clock(last.at):'尚未记录'}</div></div>
      </div></section>
      <section class="section"><h2 class="section-title">快速记录 <small>轻点一下就能记</small></h2><div class="quick-actions"><button class="quick" data-action="add" data-type="feed"><span class="bubble">🍼</span><strong>记喂奶</strong></button><button class="quick" data-action="add" data-type="wet"><span class="bubble">💧</span><strong>记尿尿</strong></button><button class="quick" data-action="add" data-type="dirty"><span class="bubble">🧷</span><strong>记便便</strong></button></div></section>
      <section class="section"><h2 class="section-title">今天的时间轴 <button class="link-btn" data-action="tab" data-tab="history">查看全部 ›</button></h2><div class="timeline">${eventList(today)}</div></section>
      <p class="footer-tip">记录只保存在当前浏览器本机。请定期在「设置」中导出备份，微信清除缓存可能导致数据丢失。</p>`;
  }
  function historyMarkup() {
    const all=onDay(historyDay),filtered=historyFilter==='all'?all:all.filter(r=>historyFilter==='diaper'?r.type==='diaper':r.type===historyFilter);
    return `<header class="hero"><div class="eyebrow">EVERY LITTLE MOMENT</div><h1>历史记录 📅</h1><p>每一次成长，都值得好好保存。</p></header>
      <div class="bar-head"><span class="day-heading">${displayDay(historyDay)}</span><div class="day-control"><button class="arrow" data-action="day" data-step="-1" aria-label="前一天">‹</button><input class="date-input" type="date" id="historyDate" value="${historyDay}" aria-label="选择日期"><button class="arrow" data-action="day" data-step="1" aria-label="后一天">›</button></div></div>
      <div class="row-stats"><div class="stat-small"><strong>${volume(all)} ml</strong><small>奶量 / ${all.filter(x=>x.type==='feed').length} 次</small></div><div class="stat-small"><strong>${countDiaper(all,'wet')} 次</strong><small>尿尿</small></div><div class="stat-small"><strong>${countDiaper(all,'dirty')} 次</strong><small>便便</small></div></div>
      <div style="margin:13px 0 16px;white-space:nowrap;overflow-x:auto"><button class="filter-chip ${historyFilter==='all'?'active':''}" data-action="filter" data-filter="all">全部</button><button class="filter-chip ${historyFilter==='feed'?'active':''}" data-action="filter" data-filter="feed">喂奶</button><button class="filter-chip ${historyFilter==='diaper'?'active':''}" data-action="filter" data-filter="diaper">大小便</button><button class="filter-chip ${historyFilter==='care'?'active':''}" data-action="filter" data-filter="care">护理</button></div>
      <div class="timeline">${eventList(filtered,'这一天暂时没有对应的记录')}</div>
      <div class="btn-row"><button class="btn btn-alt" data-action="add" data-type="feed">＋ 添加喂奶</button><button class="btn btn-alt" data-action="add" data-type="wet">＋ 添加尿布</button></div><p class="footer-tip">历史日期按真实自然日归档，跨午夜记录不按纸质记录本的整页日期计算。</p>`;
  }
  function statsMarkup() {
    const today=localDate();const days=Array.from({length:7},(_,i)=>addDays(today,i-6));
    const daily=days.map(day=>({day,value:volume(onDay(day)),feed:onDay(day).filter(r=>r.type==='feed').length}));
    const max=Math.max(1,...daily.map(x=>x.value));
    const weekRecords=state.records.filter(r=>r.at.slice(0,10)>=days[0]&&r.at.slice(0,10)<=today);
    const feeds=weekRecords.filter(r=>r.type==='feed').sort((a,b)=>timeStamp(a)-timeStamp(b));
    const intervals=[];for(let i=1;i<feeds.length;i++){let diff=(timeStamp(feeds[i])-timeStamp(feeds[i-1]))/60000;if(diff>0&&diff<=600)intervals.push(diff);}
    const countDays=days.filter(day=>onDay(day).filter(x=>x.type==='feed').length>0).length;
    const average=countDays?Math.round(volume(weekRecords)/countDays):0;
    return `<header class="hero"><div class="eyebrow">GROWTH IN NUMBERS</div><h1>成长统计 📊</h1><p>发现习惯与变化，数据仅供家庭记录参考。</p></header>
      <div class="cards"><div class="card"><div class="card-label">🍼 近7天已记录奶量</div><div class="metric">${volume(weekRecords)}<small> ml</small></div><div class="sub">${feedsPlaceholder()}</div></div>
      <div class="card"><div class="card-label">🌼 有记录日均奶量</div><div class="metric">${average}<small> ml</small></div><div class="sub">有记录的 ${countDays} 天计算</div></div></div>
      <section class="section"><h2 class="section-title">最近7天奶量趋势 <small>自然日汇总</small></h2><div class="card" style="padding:10px 12px 14px"><div class="chart">${daily.map((d,i)=>`<div class="chart-col ${i===6?'active':''}"><span class="chart-value">${d.value||'—'}</span><div class="chart-bar-wrap"><div class="chart-bar" style="height:${Math.max(3,Math.round(d.value/max*136))}px"></div></div><span class="chart-label">${d.day.slice(5).replace('-','/')}</span></div>`).join('')}</div></div></section>
      <section class="section"><h2 class="section-title">观察小结</h2><div class="row-stats"><div class="stat-small"><strong>${feeds.length}</strong><small>7天喂奶次数</small></div><div class="stat-small"><strong>${countDiaper(weekRecords,'wet')}</strong><small>7天尿尿次数</small></div><div class="stat-small"><strong>${countDiaper(weekRecords,'dirty')}</strong><small>7天便便次数</small></div></div><div class="tip">⏱ 有效相邻喂奶间隔均值：${intervals.length?fmtDuration(intervals.reduce((a,b)=>a+b,0)/intervals.length):'暂无足够记录'}。这是按已记录数据计算的统计值，不能作为必须遵守的喂养间隔。未记录不代表没有喂奶。</div></section>`;
    function feedsPlaceholder() {return `${feeds.length} 次记录`;}
  }
  function settingsMarkup() {
    const s=state.settings;
    return `<header class="hero"><div class="eyebrow">MAKE IT YOURS</div><h1>偏好设置 ⚙️</h1><p>为扬扬设置专属的日常提醒。</p></header>
      <h2 class="section-title section">宝宝资料</h2><div class="setting-block"><div class="setting-row"><div><h3>宝宝小名</h3><p>首页显示的名字</p></div><input type="text" id="profileName" maxlength="15" value="${htmlSafe(state.profile.name)}" style="width:100px;max-width:40%;border:1px solid #e1eae3;border-radius:11px;padding:9px;text-align:right"></div><div class="setting-row"><div><h3>出生日期</h3><p>用于计算成长天数</p></div><input class="date-input" id="profileBirthday" type="date" value="${htmlSafe(state.profile.birthday)}"></div></div>
      <h2 class="section-title section">喂奶提醒</h2><div class="setting-block"><div class="setting-row"><div><h3>开启页面内提醒</h3><p>仅网页保持运行时可及时提醒</p></div><input type="checkbox" class="toggle" id="reminderOn" ${s.reminderOn?'checked':''}></div><div class="setting-row"><div><h3>喂奶提醒间隔</h3><p>从上次记录的喂奶时间开始计算</p></div><select id="intervalMin"><option value="120" ${s.intervalMin==120?'selected':''}>2小时</option><option value="150" ${s.intervalMin==150?'selected':''}>2.5小时</option><option value="180" ${s.intervalMin==180?'selected':''}>3小时</option><option value="210" ${s.intervalMin==210?'selected':''}>3.5小时</option><option value="240" ${s.intervalMin==240?'selected':''}>4小时</option><option value="300" ${s.intervalMin==300?'selected':''}>5小时</option></select></div><div class="setting-row"><div><h3>提前提示</h3><p>到时间前的页面内预告</p></div><select id="advanceMin"><option value="0" ${s.advanceMin==0?'selected':''}>不提前</option><option value="5" ${s.advanceMin==5?'selected':''}>5分钟</option><option value="10" ${s.advanceMin==10?'selected':''}>10分钟</option><option value="15" ${s.advanceMin==15?'selected':''}>15分钟</option><option value="30" ${s.advanceMin==30?'selected':''}>30分钟</option></select></div></div><div class="tip">⚠️ 微信网页关闭、切到后台或被系统休眠时，无法保证准时通知。这里的时间是家长自定义提醒，不是医疗喂养建议。</div>
      <h2 class="section-title section">数据与备份</h2><div class="setting-block"><div class="setting-row"><div><h3>当前记录</h3><p>存储于当前设备及浏览器，不会自动同步</p></div><strong>${state.records.length} 条</strong></div><div class="setting-row"><div><h3>导出数据</h3><p>保存 JSON 备份，可在另一台设备导入</p></div><button class="btn btn-alt" data-action="export">导出</button></div><div class="setting-row"><div><h3>导入历史数据</h3><p>从之前导出的 JSON 或已核对的历史记录导入</p></div><button class="btn btn-alt" data-action="import">导入</button></div><div class="setting-row"><div><h3>清空本机记录</h3><p>不可恢复，建议先导出备份</p></div><button class="btn btn-danger" data-action="clear">清空</button></div></div>
      <div class="tip">🔒 隐私说明：此版本无账号和服务器，所有记录仅保存到当前浏览器本地。更换手机、清理微信缓存、卸载微信都可能使数据丢失。请定期导出备份。</div>
      <p class="footer-tip">扬扬成长助手 · V1.0 网页版 · 仅作家庭护理记录工具</p>`;
  }
  function render() {
    root.innerHTML=tab==='home'?homeMarkup():tab==='history'?historyMarkup():tab==='stats'?statsMarkup():settingsMarkup();
    navMarkup();
  }
  function toast(msg,actionLabel='',fn=null) {
    if (toastTimer)clearTimeout(toastTimer);
    toastHost.innerHTML=`<div class="toast" role="status"><span>${htmlSafe(msg)}</span>${actionLabel?`<button id="toastAction">${htmlSafe(actionLabel)}</button>`:''}</div>`;
    if(actionLabel&&fn)document.getElementById('toastAction').onclick=()=>{fn();toastHost.innerHTML='';};
    toastTimer=setTimeout(()=>toastHost.innerHTML='',4000);
  }
  function defaultDayForForm() {return tab==='history'?historyDay:localDate();}
  function makeModal(type, rec=null, initialDiaperType=null) {
    modalId=rec?.id??null;modalType=type;
    pendingType=rec?.diaperType || initialDiaperType || 'wet';
    const now=rec?.at || (defaultDayForForm()===localDate()?localDateTime():defaultDayForForm()+'T12:00');
    const f=(key,val)=>htmlSafe(rec?.[key]??val);
    let form='';
    if(type==='feed'){
      form=`<div class="field"><label for="feedType">喂养方式</label><select id="feedType"><option value="formula" ${f('feedType','formula')==='formula'?'selected':''}>配方奶（瓶喂）</option><option value="expressed" ${f('feedType','formula')==='expressed'?'selected':''}>母乳（瓶喂）</option><option value="breastfeeding" ${f('feedType','formula')==='breastfeeding'?'selected':''}>母乳（亲喂）</option><option value="mixed" ${f('feedType','formula')==='mixed'?'selected':''}>混合喂养</option></select></div>
        <div class="form-grid"><div class="field"><label for="feedAmount">本次奶量 (ml)</label><input id="feedAmount" type="number" min="0" max="3000" step="1" inputmode="numeric" value="${f('amount','120')}" required></div><div class="field"><label for="extraAmount">追加补喂 (ml)</label><input id="extraAmount" type="number" min="0" max="3000" step="1" inputmode="numeric" value="${f('extra','0')}"></div></div>
        <div class="amount-presets">${[60,90,100,120,130,140,150,180].map(n=>`<button class="preset" type="button" data-action="amount" data-amount="${n}">${n} ml</button>`).join('')}</div>`;
    } else if(type==='diaper') {
      form=`<div class="field"><label>尿布类型</label><div class="choice-row"><button type="button" class="choice ${pendingType==='wet'?'active':''}" data-action="diaper-kind" data-kind="wet">💧 尿尿</button><button type="button" class="choice ${pendingType==='dirty'?'active':''}" data-action="diaper-kind" data-kind="dirty">🧷 便便</button><button type="button" class="choice ${pendingType==='both'?'active':''}" data-action="diaper-kind" data-kind="both">🌼 都有</button></div></div>
        <div id="stoolFields" class="${pendingType==='wet'?'hidden':''}"><div class="form-grid"><div class="field"><label for="stoolColor">便便颜色</label><select id="stoolColor">${['','黄','金黄','绿','黄绿','褐','黑','红','灰白','其他'].map(v=>`<option value="${v}" ${rec?.stoolColor===v?'selected':''}>${v||'未填写'}</option>`).join('')}</select></div><div class="field"><label for="stoolAmount">便便量</label><select id="stoolAmount">${['','少','中','多'].map(v=>`<option value="${v}" ${rec?.stoolAmount===v?'selected':''}>${v||'未填写'}</option>`).join('')}</select></div></div><div class="field"><label for="stoolTexture">便便性状</label><select id="stoolTexture">${['','糊状','稀软','水样','颗粒','偏硬','奶瓣','其他'].map(v=>`<option value="${v}" ${rec?.stoolTexture===v?'selected':''}>${v||'未填写'}</option>`).join('')}</select></div></div>`;
    } else {
      form=`<div class="field"><label for="careTitle">护理事项</label><select id="careTitle">${['维生素AD','体温观察','洗澡','抚触','用药','其他'].map(v=>`<option value="${v}" ${rec?.careTitle===v?'selected':''}>${v}</option>`).join('')}</select></div>`;
    }
    const title=rec?'编辑记录':type==='feed'?'记录喂奶':type==='diaper'?'记录大小便':'记录护理';
    modalHost.innerHTML=`<div class="modal-back" data-action="backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dialogTitle"><div class="modal-title"><h2 id="dialogTitle">${title}</h2><button class="close" data-action="close" aria-label="关闭">×</button></div><form id="recordForm"><div class="form-grid"><div class="field"><label for="recordDate">日期</label><input id="recordDate" type="date" value="${now.slice(0,10)}" required></div><div class="field"><label for="recordTime">时间</label><input id="recordTime" type="time" value="${now.slice(11,16)}" required></div></div>${form}<div class="field"><label for="recordNote">备注（可选）</label><textarea id="recordNote" placeholder="例如：补喂、尿布情况、特殊观察等">${f('note','')}</textarea></div><button class="btn btn-wide" type="submit">${rec?'保存修改':'保存记录'}</button>${rec?`<button class="btn btn-danger btn-wide" type="button" data-action="delete" data-id="${htmlSafe(rec.id)}" style="margin-top:9px">删除这条记录</button>`:''}</form></div></div>`;
    const first=modalHost.querySelector('.modal .close');if(first)first.focus();
  }
  function closeModal(){modalHost.innerHTML='';modalType=null;modalId=null;}
  function newId(){return (globalThis.crypto&&crypto.randomUUID)?crypto.randomUUID():`yy-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
  function submitForm(){
    const date=document.getElementById('recordDate').value,time=document.getElementById('recordTime').value;
    if(!date||!time){toast('请选择完整的日期和时间');return;}
    const at=`${date}T${time}`,note=document.getElementById('recordNote').value.trim();
    let input={type:modalType,at,note};
    if(modalType==='feed'){
      const amount=Number(document.getElementById('feedAmount').value),extra=Number(document.getElementById('extraAmount').value||0);
      if(!Number.isFinite(amount)||!Number.isFinite(extra)||amount<0||extra<0||amount+extra>3000){toast('请填写正确的奶量');return;}
      input={...input,feedType:document.getElementById('feedType').value,amount,extra};
    }else if(modalType==='diaper'){
      input={...input,diaperType:pendingType,stoolColor:document.getElementById('stoolColor').value,stoolAmount:document.getElementById('stoolAmount').value,stoolTexture:document.getElementById('stoolTexture').value};
    }else input={...input,careTitle:document.getElementById('careTitle').value};
    const wasEditing=Boolean(modalId);
    const old=state.records.find(r=>r.id===modalId);
    const next={...(old||{}),...input,id:modalId||newId(),source:old?.source||'manual',verified:true};
    if(modalId)state.records=state.records.map(r=>r.id===modalId?next:r);else state.records.push(next);
    if(!save()){return;}
    closeModal();historyDay=date;render();toast(wasEditing?'已修改记录':'记录已保存');
  }
  function deleteRecord(id){
    const old=state.records.find(r=>r.id===id);if(!old||!confirm('确定删除这条记录吗？'))return;
    state.records=state.records.filter(r=>r.id!==id);if(!save())return;lastUndo=old;closeModal();render();toast('已删除记录','撤销',()=>{if(lastUndo){state.records.push(lastUndo);save();render();lastUndo=null;}});
  }
  function exportJson(){
    const content=JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2);
    const blob=new Blob([content],{type:'application/json;charset=utf-8'});
    const file=new File([blob],`扬扬成长记录_${localDate()}.json`,{type:'application/json'});
    // iOS 微信可能禁止直接下载，支持时先尝试系统分享。
    if(navigator.canShare&&navigator.canShare({files:[file]})){navigator.share({files:[file],title:'扬扬成长助手数据备份'}).catch(err=>{if(err?.name!=='AbortError')download();});}
    else download();
    function download(){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已发起备份导出，请确认文件保存成功');}
  }
  async function importFile(file){
    if(!file)return;
    if(file.size>15*1024*1024){toast('文件超过15MB，请分批导入');return;}
    try{
      const data=JSON.parse(await file.text());const rows=Array.isArray(data)?data:Array.isArray(data.records)?data.records:null;
      if(!rows)throw new Error('没有 records 数组');
      if(rows.length>100000)throw new Error('记录数量过多');
      const clean=rows.filter(validRecord).map(r=>({...r,id:String(r.id||newId())}));
      if(!clean.length)throw new Error('文件没有合法记录');
      const invalid=rows.length-clean.length;
      const existing=new Set(state.records.map(r=>r.id));
      const incoming=clean.filter(r=>!existing.has(r.id));
      if(!confirm(`文件共有 ${rows.length} 条记录，合格 ${clean.length} 条，${invalid} 条格式不符，新增 ${incoming.length} 条（重复ID跳过）。确定合并导入吗？`))return;
      const oldRecords=state.records;
      state.records=[...oldRecords,...incoming];
      if(save()){render();toast(`已新增 ${incoming.length} 条记录`);}else state.records=oldRecords;
    }catch(e){toast('导入失败：'+(e.message||'文件格式错误'));}
    finally{document.getElementById('importFile').value='';}
  }
  function clearData(){if(confirm('确定清空当前浏览器的所有记录？请先导出备份。')&&confirm('最后确认：清空后无法恢复，是否继续？')){state.records=[];if(save()){render();toast('已清空本机记录');}}}
  function setSetting(id){
    if(id==='reminderOn')state.settings.reminderOn=document.getElementById(id).checked;
    if(id==='intervalMin')state.settings.intervalMin=Number(document.getElementById(id).value);
    if(id==='advanceMin')state.settings.advanceMin=Number(document.getElementById(id).value);
    if(id==='profileName')state.profile.name=document.getElementById(id).value.trim()||'宝宝';
    if(id==='profileBirthday')state.profile.birthday=document.getElementById(id).value||DEFAULT.profile.birthday;
    save();toast('设置已保存');
  }
  document.addEventListener('click',e=>{
    const target=e.target.closest('[data-action]');if(!target)return;
    const action=target.dataset.action;
    if(action==='backdrop' && e.target===target){closeModal();return;}
    if(action==='close'){closeModal();return;}
    if(action==='tab'){tab=target.dataset.tab;render();window.scrollTo(0,0);return;}
    if(action==='settings'){tab='settings';render();window.scrollTo(0,0);return;}
    if(action==='add'){const type=target.dataset.type;makeModal(type==='feed'?'feed':'diaper',null,type==='dirty'?'dirty':'wet');return;}
    if(action==='edit'){const rec=state.records.find(r=>r.id===target.dataset.id);if(rec)makeModal(rec.type,rec);return;}
    if(action==='day'){historyDay=addDays(historyDay,Number(target.dataset.step));render();return;}
    if(action==='filter'){historyFilter=target.dataset.filter;render();return;}
    if(action==='amount'){document.getElementById('feedAmount').value=target.dataset.amount;document.querySelectorAll('.preset').forEach(x=>x.classList.toggle('active',x===target));return;}
    if(action==='diaper-kind'){pendingType=target.dataset.kind;document.querySelectorAll('.choice').forEach(x=>x.classList.toggle('active',x===target));document.getElementById('stoolFields').classList.toggle('hidden',pendingType==='wet');return;}
    if(action==='delete'){deleteRecord(target.dataset.id);return;}
    if(action==='export'){exportJson();return;}
    if(action==='import'){document.getElementById('importFile').click();return;}
    if(action==='clear'){clearData();return;}
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='historyDate'){historyDay=e.target.value||localDate();render();}
    if(e.target.id==='feedType' && e.target.value==='breastfeeding' && !modalId){document.getElementById('feedAmount').value='0';document.getElementById('extraAmount').value='0';}
    if(['reminderOn','intervalMin','advanceMin','profileBirthday','profileName'].includes(e.target.id))setSetting(e.target.id);
  });
  document.addEventListener('submit',e=>{if(e.target.id==='recordForm'){e.preventDefault();submitForm();}});
  document.getElementById('importFile').addEventListener('change',e=>importFile(e.target.files[0]));
  let notifiedKey='';
  function tick(){
    if(tab==='home'&&!modalType){const next=nextReminder(),p=document.querySelector('[data-live-countdown]'),sub=document.querySelector('[data-live-description]');
      if(p&&sub&&next){const delta=Math.ceil((next-Date.now())/60000);p.textContent=delta<=0?'已到提醒时间':fmtDuration(delta);sub.textContent=`预计 ${clock(localDateTime(new Date(next)))} · 按家长设置的 ${fmtDuration(Number(state.settings.intervalMin))} 间隔计算`;}
    }
    const next=nextReminder();
    if(next){const r=recentFeed(),key=`${r.id}:${next}`;const advance=Number(state.settings.advanceMin)||0;
      if(Date.now()>=next-advance*60000 && Date.now()<=next+24*3600000 && notifiedKey!==key){notifiedKey=key;toast(Date.now()>=next?'扬扬可能到预设喂奶提醒时间了':'距离预设喂奶时间还有'+advance+'分钟');if(navigator.vibrate)navigator.vibrate(180);}
    }
  }
  if('serviceWorker' in navigator && location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
  render();setInterval(tick,15000);tick();
})();
