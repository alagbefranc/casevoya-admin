(function(){
// Platform administration · spec pass 29 Oct 2026. Follows casevoya-admin origin/main docs/FRONTEND-SPEC.md (PR #7, af62382).
// Layout/look: Casevoya Sheet (Inter body, Erode headings, #0075DE / #F6F5F4 / #111), Mebius-style meters drawn only from real counts.
// URL flags: ?tab=<page> &sub=<tab> &id=<record> · &role=owner|operator|viewer · &session=fresh|stale|none|mismatch
//            &state=loading|slow|empty|filtered|error|denied|offline|stale|validation|conflict|notfound
//            &screen=noaccess|gateerror|invite|signin|stepup|unauth · &dlg=<dialog to open on load> · &drw=<drawer to open>
const TB=Q.get('tab')||'overview',SUB=Q.get('sub')||'',RID=Q.get('id')||'',ROLE=Q.get('role')||'owner',SESS=Q.get('session')||'fresh',ST=Q.get('state')||'',SCR=Q.get('screen')||'';
const CAN={operate:ROLE!='viewer',manage:ROLE=='owner',review:ROLE!='viewer'&&Q.get('reviewer')!='0'};
const STALE=SESS!='fresh'; // step-up stale (<60 s left) or no session: confirm dialogs show the inline code field
const OFF=ST=='offline';
const NM={overview:'Operations',firms:'Firms',subscriptions:'Subscriptions',usage:'Usage',verification:'Verification',grants:'Grants',health:'Health',incidents:'Incidents',releases:'Releases',config:'Config',audit:'Audit log',privacy:'Privacy',sample:'Sample mode',migration:'Migration'};
const U=(o={})=>{const q=new URLSearchParams();const b={tab:TB,role:ROLE!='owner'?ROLE:'',session:SESS!='fresh'?SESS:''};Object.entries({...b,...o}).forEach(([k,v])=>{if(v)q.set(k,v)});return 'admin.html?'+q};
const NOW='29 Oct 2026, 2:05 PM EDT';
shell({admin:true});
document.body.classList.add('axp');
window.AX_OWN=window.AX_OWN||{};['loading','slow','empty','filtered','error','denied','offline','stale','validation','conflict','notfound','success','maintenance'].forEach(s=>AX_OWN[s]=()=>true);

(function(){const st=document.createElement('style');st.textContent=`
@font-face{font-family:Inter;src:url(../../fonts/InterVariable.woff2) format('woff2');font-weight:100 900;font-display:swap}
body.axp,body.axp .btn,body.axp input,body.axp select,body.axp textarea,body.axp table,body.axp .side{font-family:Inter,system-ui,sans-serif;font-feature-settings:'tnum' 1,'cv11' 1}
body.axp h1,body.axp h2,body.axp h3,body.axp .display{font-family:Erode,Georgia,serif}
body.axp .mhead,body.axp .statusbar{display:none}
body.axp .k2-rv{opacity:1!important;transform:none!important;filter:none!important}
.mxD{font-family:Inter,system-ui,sans-serif;vertical-align:middle}
body.axp .side .grp.axg{margin-top:14px}.axgl{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8b8680;padding:0 12px 6px;font-weight:600}
body.axp .side .axk{font-size:10.5px;font-weight:600;border-radius:999px;padding:1px 7px;background:#26323f;color:#cfe2f6;white-space:nowrap}
body.axp .side .axk.w{background:#3d2e14;color:#ffc96b}body.axp .side .axk.b{background:#3f1d1d;color:#ff9b93}
/* top bar + banner (spec 1.5–1.7) */
body.axp header.top{background:#111;color:#fff;border-radius:16px 16px 0 0;margin:-1px -1px 0;padding:10px 16px;min-height:56px;gap:12px;flex-wrap:nowrap}
.axTB{display:flex;align-items:center;gap:12px;width:100%}.axTB .lbl{font-weight:600;font-size:14.5px;display:flex;align-items:center;gap:9px}.axTB .lbl img{width:26px;height:26px;border-radius:8px;background:#0075DE;padding:4px}
.axTB .sp{flex:1}.axTB a.ex{color:#cfcac4;font-size:13.5px;text-decoration:none;display:flex;gap:6px;align-items:center}.axTB a.ex:hover{color:#fff}
.axChip{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;border-radius:999px;padding:5px 11px;border:0;cursor:default;white-space:nowrap}
.axChip i{width:7px;height:7px;border-radius:50%;background:currentColor}
.axChip.g{background:#e8f5ec;color:#1d7a3e}.axChip.bl{background:#e8f1fb;color:#0075DE}.axChip.n{background:#ece9e5;color:#4a4642}.axChip.a{background:#fff3e0;color:#a35b00}
.axSI{background:#fff;color:#111;border:0;border-radius:10px;font:600 12.5px Inter,sans-serif;padding:6px 11px;cursor:pointer}
.axAv{position:relative}.axAv>summary{list-style:none;cursor:pointer;width:34px;height:34px;border-radius:11px;background:#26323f;color:#cfe2f6;display:grid;place-items:center;font-size:12px;font-weight:600}.axAv>summary::-webkit-details-marker{display:none}
.axAv .m{position:absolute;right:0;top:42px;background:#fff;color:#111;border:1px solid #ebe8e4;border-radius:16px;box-shadow:0 20px 40px -20px rgba(17,17,17,.3);min-width:250px;padding:8px;z-index:40}
.axAv .m .who{padding:8px 10px 10px;border-bottom:1px solid #f0eeeb;margin-bottom:6px;font-size:13px}.axAv .m .who small{display:block;color:#6b6762}
.axAv .m a,.axAv .m button{display:flex;gap:8px;align-items:center;width:100%;text-align:left;background:none;border:0;padding:9px 10px;border-radius:10px;font:500 13.5px Inter,sans-serif;color:#111;text-decoration:none;cursor:pointer}.axAv .m a:hover,.axAv .m button:hover{background:#f6f5f4}
.axMenu{display:none;background:#26323f;color:#fff;border:0;border-radius:10px;font:600 13px Inter,sans-serif;padding:7px 11px;gap:6px;align-items:center}
.axBan{display:flex;gap:10px;align-items:flex-start;background:#fff3e0;color:#7a4500;border-bottom:1px solid #f6dfb8;padding:9px 16px;font-size:13px;margin:0 -1px 18px}.axBan .ic{width:16px;height:16px;flex:none;margin-top:1px;color:#a35b00}
/* page header */
.axH{display:flex;align-items:flex-end;gap:16px;margin:4px 0 18px;flex-wrap:wrap}.axH h1{font-size:34px;font-weight:500;letter-spacing:-.01em;margin:0;line-height:1.1}.axH p{margin:6px 0 0;color:#5d5954;font-size:14.5px;max-width:720px}.axH .acts{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.axCrumb{font-size:13px;color:#6b6762;margin:0 0 6px;display:flex;gap:6px;align-items:center}.axCrumb a{color:#0075DE;text-decoration:none}
/* metric cards (Mebius look) */
.mxG5{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:0 0 12px}.mxG4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 0 14px}.mxG6{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin:0 0 14px}.mxG3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 0 14px}
.mxG2{display:grid;grid-template-columns:1.25fr 1fr;gap:12px;margin:0 0 14px}
.mxC{background:#fff;border:1px solid #ebe8e4;border-radius:22px;padding:16px 16px 14px;box-shadow:0 1px 0 rgba(17,17,17,.03),0 8px 24px -16px rgba(17,17,17,.12);position:relative;overflow:hidden;text-decoration:none;color:#111;display:block;min-width:0}
a.mxC:hover{border-color:#cfe2f6}a.mxC:focus-visible{outline:2px solid #0075DE;outline-offset:2px}
.mxT{display:flex;align-items:center;gap:8px;font-size:13px;color:#6b6762;margin:0 0 8px}.mxT .ic{width:16px;height:16px;color:#0075DE;flex:none}.mxT .r{margin-left:auto}
.mxN{font-size:28px;font-weight:600;letter-spacing:-.02em;line-height:1.1;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.mxN.sm{font-size:22px}
.mxD{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px;background:#e8f5ec;color:#1d7a3e;white-space:nowrap}.mxD.w{background:#fff3e0;color:#a35b00}.mxD.b{background:#fde8e8;color:#b42318}.mxD.n{background:#e8f1fb;color:#0075DE}.mxD.g{background:#f0eeeb;color:#4a4642}
.mxS{font-size:12.5px;color:#6b6762;margin-top:4px}
.mxK-bar{margin-top:12px;height:14px;display:flex;border-radius:5px;overflow:hidden;gap:2px}.mxK-bar i{display:block;height:100%;border-radius:4px}
.mxK-bar .f{background:#0075DE}.mxK-bar .w{background:#f0a200}.mxK-bar .r{background:#d92d20}.mxK-bar .g{background:#1d9a4b}.mxK-bar .n{background:#9cc7f5}
.mxK-bar .rest{flex:1;background:repeating-linear-gradient(90deg,#e6e3df 0 2px,transparent 2px 5px)}
.mxSc{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#8b8680;margin-top:6px;flex-wrap:wrap}
.mxK-dots{margin-top:12px;display:grid;grid-template-columns:repeat(12,1fr);gap:3px}.mxK-dots i{aspect-ratio:1;border-radius:3px;background:#ebe8e4}.mxK-dots i.on{background:#f0a200}.mxK-dots i.ok{background:#0075DE}.mxK-dots i.r{background:#d92d20}.mxK-dots i.g{background:#1d9a4b}
.ax-meter{display:block;height:6px;border-radius:4px;background:#efedea;overflow:hidden}.ax-meter i{display:block;height:100%;background:#0075DE;border-radius:4px}.ax-meter.w i{background:#f0a200}.ax-meter.b i{background:#d92d20}
.mxSk{background:linear-gradient(90deg,#f1efec,#f8f7f5,#f1efec);background-size:200% 100%;animation:mxs 1.2s infinite;border-radius:12px}@keyframes mxs{to{background-position:-200% 0}}
/* panels, tables, filters */
.axP{background:#fff;border:1px solid #ebe8e4;border-radius:22px;margin:0 0 14px;overflow:hidden}.axP>h2{font:600 15px Inter,sans-serif;margin:0;padding:14px 16px;border-bottom:1px solid #f0eeeb;display:flex;align-items:center;gap:8px}.axP>h2 .ic{width:16px;height:16px;color:#0075DE}.axP>h2 .r{margin-left:auto;font-weight:500;font-size:13px;color:#6b6762;display:flex;gap:8px;align-items:center}
.axPad{padding:14px 16px}
.axT{width:100%;border-collapse:collapse;font-size:13.5px}.axT th{font-weight:600;font-size:12px;color:#6b6762;text-align:left;padding:10px 12px;border-bottom:1px solid #ebe8e4;white-space:nowrap;background:#fbfaf9}
.axT td{padding:11px 12px;border-bottom:1px solid #f0eeeb;vertical-align:middle;height:48px;box-sizing:border-box}.axT tr:last-child td{border-bottom:0}.axT tr[data-go]{cursor:pointer}.axT tr[data-go]:hover td{background:#f8fbff}
.axT td small{display:block;color:#6b6762;font-size:12.5px}.axT .mono,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
.axTw{overflow:auto}.axPg{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid #f0eeeb;font-size:13px;color:#6b6762}.axPg .r{margin-left:auto;display:flex;gap:6px}
.axF{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin:0 0 12px}.axF .fld{margin:0;min-width:150px}.axF .fld label{font-size:12px;color:#6b6762}.axF .srch{flex:1;min-width:220px}
.axFb{display:none}
.axSeg{display:inline-flex;background:#efedea;border-radius:12px;padding:3px;gap:2px;margin:0 0 12px;flex-wrap:wrap}.axSeg a{font-size:13px;font-weight:500;padding:6px 12px;border-radius:9px;color:#5d5954;text-decoration:none;white-space:nowrap}.axSeg a.on{background:#fff;color:#111;box-shadow:0 1px 2px rgba(0,0,0,.08)}.axSeg a b{font-weight:600;margin-left:4px;color:#8b8680}
.axTabs{display:flex;gap:4px;border-bottom:1px solid #ebe8e4;margin:0 0 16px;overflow:auto}.axTabs a{padding:10px 12px;font-size:14px;color:#5d5954;text-decoration:none;border-bottom:2px solid transparent;white-space:nowrap;margin-bottom:-1px}.axTabs a.on{color:#111;border-color:#0075DE;font-weight:600}
.axChips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}.axChips .c{font-size:12.5px;border:1px solid #e3e0dc;background:#fff;border-radius:999px;padding:4px 10px;color:#3d3a36;text-decoration:none;white-space:nowrap}.axChips .c.on{border-color:#0075DE;color:#0075DE;background:#f2f8fe}.axChips .c.w{border-color:#f3d39a;background:#fffaf0;color:#8a5200}.axChips .c.b{border-color:#f5c2be;background:#fff6f5;color:#b42318}
.rc{display:inline-block;font-size:11.5px;font-weight:600;border-radius:7px;padding:2px 7px;margin:2px 4px 2px 0;background:#fff3e0;color:#a35b00}.rc.b{background:#fde8e8;color:#b42318}
.axNote{font-size:12.5px;color:#6b6762;margin:8px 0 0}.axNote.w{color:#a35b00}
.axStub{display:flex;gap:14px;align-items:flex-start;padding:20px;background:#f6f5f4;border:1px dashed #d9d5d0;border-radius:18px;color:#3d3a36;font-size:14px}.axStub b{display:block;font-size:15px;margin-bottom:4px;color:#111}.axStub .ic{width:20px;height:20px;color:#6b6762;flex:none}
.axDL{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 20px;margin:0}.axDL div{min-width:0}.axDL dt{font-size:12px;color:#6b6762}.axDL dd{margin:2px 0 0;font-size:14px;overflow-wrap:anywhere}
.axTL{list-style:none;margin:0;padding:0}.axTL li{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:10px 0;border-top:1px solid #f0eeeb;font-size:13.5px}.axTL li:first-child{border-top:0}.axTL time{color:#6b6762;font-size:12.5px}
.axStep{display:flex;gap:3px;align-items:center}.axStep i{width:16px;height:6px;border-radius:3px;background:#e6e3df}.axStep i.on{background:#0075DE}.axStep small{margin-left:6px;font-size:12px;color:#3d3a36}
.axDots{display:flex;gap:4px}.axDots i{width:10px;height:10px;border-radius:50%;border:1.5px solid #c9c4be}.axDots i.on{background:#0075DE;border-color:#0075DE}
.axImp{display:flex;gap:10px;align-items:center;font-size:13px;color:#3d3a36;background:#f6f5f4;border-radius:12px;padding:10px 12px;margin:10px 14px 14px}.axImp .ic{color:#0075DE;width:16px;height:16px}
.axGL{list-style:none;margin:0;padding:0}.axGL li{display:flex;gap:12px;align-items:center;padding:12px 16px;border-top:1px solid #f0eeeb;font-size:13.5px}.axGL li:first-child{border-top:0}.axGL .ki{width:34px;height:34px;border-radius:11px;background:#e8f1fb;color:#0075DE;display:grid;place-items:center;flex:none}.axGL .ki .ic{width:16px;height:16px}.axGL small{display:block;color:#6b6762;font-size:12.5px}.axGL .bd{margin-left:auto}
.axStale{display:flex;gap:8px;align-items:center;font-size:13px;color:#a35b00;margin:-8px 0 14px}
.axSum{border:1px solid #f5c2be;background:#fff6f5;border-radius:14px;padding:12px 14px;margin:0 0 14px;font-size:13.5px;color:#7a1d16}.axSum b{display:block;margin-bottom:4px}.axSum a{color:#b42318}
.fld .err{display:block;color:#b42318;font-size:12.5px;margin-top:4px}.fld.bad .inp,.fld.bad .sel,.fld.bad textarea{border-color:#d92d20}
.axCnt{font-size:12px;color:#8b8680;text-align:right;margin-top:3px}
.axOtp{display:flex;gap:8px}.axOtp input{width:44px;height:50px;border:1px solid #dcd8d3;border-radius:14px;text-align:center;font:600 20px Inter,sans-serif}
.axCode{background:#f2f8fe;border:1px solid #cfe2f6;border-radius:16px;padding:12px 14px;margin:12px 0 0}.axCode p{margin:0 0 8px;font-size:13.5px}
.axRadio{display:flex;gap:8px;flex-wrap:wrap}.axRadio label{display:flex;gap:6px;align-items:center;border:1px solid #e3e0dc;border-radius:12px;padding:8px 11px;font-size:13.5px;cursor:pointer}.axRadio label:has(input:checked){border-color:#0075DE;background:#f2f8fe}
.axChk{display:flex;gap:9px;align-items:flex-start;font-size:13.5px;margin:10px 0}.axChk input{margin-top:3px;width:16px;height:16px;accent-color:#0075DE}
.axSw{width:38px;height:22px;border-radius:999px;background:#d9d6d2;position:relative;border:0;cursor:pointer;flex:none;vertical-align:middle}.axSw::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 1px 2px rgba(0,0,0,.2)}.axSw[aria-checked=true]{background:#0075DE}.axSw[aria-checked=true]::after{left:19px}
.axDiff{display:grid;grid-template-columns:1fr 1fr;gap:12px}.axDiff>div{border:1px solid #ebe8e4;border-radius:14px;padding:12px;font-size:13.5px}.axDiff h4{margin:0 0 8px;font:600 12px Inter,sans-serif;color:#6b6762;text-transform:uppercase;letter-spacing:.05em}.axDiff ul{margin:0;padding-left:18px}.axDiff .add{background:#e8f5ec;color:#145c2e;border-radius:6px;padding:1px 4px}.axDiff .rem{background:#fde8e8;color:#8f1d15;border-radius:6px;padding:1px 4px;text-decoration:line-through}
.axBar{position:sticky;bottom:0;background:#fff;border-top:1px solid #ebe8e4;padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;border-radius:0 0 22px 22px}
/* full-page session screens */
.axFull{position:fixed;inset:0;z-index:70;overflow:auto;background:radial-gradient(1200px 500px at 50% -10%,#e3f0fc,transparent 60%),#F6F5F4;display:grid;place-items:center;padding:32px 16px}
.axFull .card{width:100%;max-width:480px;background:#fff;border:1px solid #ebe8e4;border-radius:28px;padding:30px;box-shadow:0 30px 60px -30px rgba(17,17,17,.25)}
.axFull h1{font-family:Erode,Georgia,serif;font-weight:500;font-size:30px;margin:16px 0 8px;letter-spacing:-.01em}.axFull p{color:#5d5954;font-size:14.5px;margin:0 0 14px}
.axFull .btn.p{justify-content:center;height:44px;border-radius:14px}
.axLogo{display:flex;align-items:center;gap:8px;font:600 15px Inter,sans-serif}.axLogo img{width:28px;height:28px;border-radius:9px;background:#0075DE;padding:4px}
.axSteps{list-style:none;padding:0;margin:0 0 16px;counter-reset:s}.axSteps li{counter-increment:s;display:flex;gap:10px;align-items:flex-start;padding:8px 0;font-size:14px}.axSteps li::before{content:counter(s);width:24px;height:24px;border-radius:50%;background:#e8f1fb;color:#0075DE;font-weight:600;font-size:12.5px;display:grid;place-items:center;flex:none}.axSteps li.done::before{content:'✓';background:#e8f5ec;color:#1d7a3e}
/* drawer */
.axDS{position:fixed;inset:0;background:rgba(17,17,17,.32);z-index:55;opacity:0;pointer-events:none;transition:opacity .2s}.axDS.on{opacity:1;pointer-events:auto}
.axDr{position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);background:#fff;z-index:56;transform:translateX(100%);transition:transform .25s cubic-bezier(.2,.8,.2,1);display:flex;flex-direction:column;box-shadow:-30px 0 60px -30px rgba(17,17,17,.35)}.axDr.on{transform:none}
.axDr .dh{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #f0eeeb}.axDr .dh h2{font:500 22px Erode,Georgia,serif;margin:0;flex:1}.axDr .db{padding:18px 20px;overflow:auto;flex:1}.axDr .df{display:flex;gap:8px;padding:14px 20px;border-top:1px solid #ebe8e4;justify-content:flex-end;flex-wrap:wrap}
.axDr .x,.dlg .x{background:none;border:0;cursor:pointer;width:36px;height:36px;border-radius:10px;display:grid;place-items:center}.axDr .x:hover{background:#f6f5f4}
dialog.axDlg{border:0;border-radius:24px;padding:0;width:min(520px,calc(100vw - 24px));box-shadow:0 30px 80px -20px rgba(17,17,17,.4)}dialog.axDlg::backdrop{background:rgba(17,17,17,.38)}
dialog.axDlg .dh{display:flex;align-items:center;gap:10px;padding:18px 20px 6px}dialog.axDlg .dh h2{font:500 22px Erode,Georgia,serif;margin:0;flex:1}dialog.axDlg .db{padding:6px 20px 8px;font-size:14px;color:#3d3a36}dialog.axDlg .df{display:flex;gap:8px;justify-content:flex-end;padding:12px 20px 18px;flex-wrap:wrap}
.btn.dng{background:#b42318;color:#fff;border-color:#b42318}
.axOffline .btn.p,.axOffline [data-act]{opacity:.45;pointer-events:none}
.axSlow{display:flex;gap:12px;align-items:center;font-size:14px;color:#3d3a36;margin:0 0 14px}
@media (max-width:1279px){.mxG5{grid-template-columns:repeat(3,1fr)}.mxG6{grid-template-columns:repeat(3,1fr)}}
@media (max-width:900px){.mxG4,.mxG3{grid-template-columns:1fr 1fr}.mxG2{grid-template-columns:1fr}.axDiff{grid-template-columns:1fr}}
@media (max-width:767px){
 body.axp header.top{border-radius:0;position:sticky;top:0;z-index:30}.axTB .lbl span.full,.axTB a.ex span{display:none}.axMenu{display:inline-flex}.axChip .t{display:none}.axChip{padding:7px}
 .mxG5,.mxG6,.mxG4,.mxG3{grid-template-columns:1fr 1fr;gap:10px}.mxC{padding:13px;border-radius:18px}.mxN{font-size:22px}.mxN.sm{font-size:19px}.mxT{font-size:12px}
 .axH h1{font-size:28px}.axH .acts{margin-left:0;width:100%}.axH .acts .btn{flex:1;justify-content:center}
 .axF .fld:not(.srch){display:none}.axFb{display:inline-flex}.axF .srch{min-width:0}
 .axT thead{display:none}.axT,.axT tbody,.axT tr,.axT td{display:block;width:100%}.axT tr{border-bottom:1px solid #ebe8e4;padding:10px 14px}.axT td{border:0;padding:3px 0;height:auto;display:flex;gap:10px;justify-content:space-between;text-align:right}
 .axT td::before{content:attr(data-l);color:#6b6762;font-size:12px;text-align:left;flex:none}.axT td:first-child{font-weight:600;text-align:left;justify-content:flex-start}.axT td:first-child::before{display:none}.axT td.act{justify-content:stretch}.axT td.act::before{display:none}.axT td.act .btn{width:100%;justify-content:center}
 .axTL li{grid-template-columns:1fr}.axDL{grid-template-columns:1fr}.axDr{width:100vw}.axGL li{flex-wrap:wrap}.axGL .bd{margin-left:46px}
 dialog.axDlg{width:100vw;max-width:100vw;margin:auto 0 0;border-radius:24px 24px 0 0;max-height:92vh}
 .axSeg{display:flex;overflow:auto;flex-wrap:nowrap}.axBan{margin:0 -1px 14px}
}`;document.head.append(st)})();
// ---------- helpers ----------
const B=(k,t)=>`<span class="mxD ${k}">${t}</span>`;
const IFOP=h=>CAN.operate?h:'';const IFOWN=h=>CAN.manage?h:'';
const Bt=(t,{p,ic,on,cls='',href,sm,dis,lbl}={})=>href?`<a class="btn ${p?'p':''} ${sm?'sm':''} ${cls}" href="${href}">${ic?I(ic):''}${t}</a>`:`<button type="button" class="btn ${p?'p':''} ${sm?'sm':''} ${cls}" ${on?`data-act onclick="${on}"`:''} ${dis?'disabled':''} ${lbl?`aria-label="${lbl}"`:''}>${ic?I(ic):''}${t}</button>`;
const H=(t,s,acts='',crumb='')=>`${crumb?`<div class="axCrumb">${crumb}</div>`:''}<div class="axH"><div><h1>${t}</h1>${s?`<p>${s}</p>`:''}</div>${acts?`<div class="acts">${acts}</div>`:''}</div>`;
const C=(ic,l,n,{d='',sub='',viz='',href='',r='',sm}={})=>{const tag=href?'a':'div';return `<${tag} class="mxC" ${href?`href="${href}"`:''}><div class="mxT">${I(ic)}<span>${l}</span>${r?`<span class="r">${r}</span>`:''}</div><div class="mxN ${sm?'sm':''}">${n}${d}</div>${sub?`<div class="mxS">${sub}</div>`:''}${viz}</${tag}>`};
const BAR=(parts,total)=>{const used=parts.reduce((a,p)=>a+p[0],0);return `<div class="mxK-bar" role="img" aria-label="${parts.map(p=>p[2]+' '+p[0]).join(', ')}">${parts.filter(p=>p[0]).map(p=>`<i class="${p[1]}" style="flex:${p[0]}" title="${p[2]} ${p[0]}"></i>`).join('')}${total>used?`<i class="rest" style="flex:${total-used}"></i>`:''}</div>`};
const DOTS=(parts,cols=12)=>{let h='';parts.forEach(([n,c])=>{for(let i=0;i<n;i++)h+=`<i class="${c}"></i>`});const used=parts.reduce((a,p)=>a+p[0],0);for(let i=used;i<cols;i++)h+='<i></i>';return `<div class="mxK-dots" aria-hidden="true">${h}</div>`};
const P=(ic,t,inner,r='',id='')=>`<section class="axP" ${id?`id="${id}"`:''}><h2>${I(ic)}${t}${r?`<span class="r">${r}</span>`:''}</h2>${inner}</section>`;
const cell=c=>typeof c=='object'&&c!==null?c:{h:c};
const T=(cols,rows,{go,cap='',pg}={})=>`<div class="axTw"><table class="axT">${cap?`<caption class="sr">${cap}</caption>`:''}<thead><tr>${cols.map(c=>`<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr ${go&&go[i]?`data-go="${go[i]}" tabindex="0"`:''}>${r.map((c,j)=>{c=cell(c);return `<td data-l="${cols[j]}" class="${c.c||''}">${c.h??''}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>${pg?`<div class="axPg"><span>${pg}</span><span class="r">${Bt('Previous',{sm:1,dis:1})}${Bt('Next',{sm:1,dis:1})}</span></div>`:''}`;
const SEL=(id,l,opts)=>`<div class="fld"><label for="${id}">${l}</label><select class="sel" id="${id}">${opts.map(o=>`<option>${o}</option>`).join('')}</select></div>`;
const FILT=(ph,flds,n=0)=>`<div class="axF"><div class="fld srch"><label for="fq">Search</label><input class="inp" id="fq" placeholder="${ph}"></div>${flds}<button class="btn axFb" type="button" onclick="axDrw('filters')">${I('filter')}Filters${n?` (${n})`:''}</button></div>`;
const SEG=(items,cur,key='seg')=>`<nav class="axSeg" aria-label="Filter">${items.map(([k,l,n])=>`<a href="${U({sub:SUB,[key]:k})}" class="${cur==k?'on':''}" ${cur==k?'aria-current="true"':''}>${l}${n!=null?`<b>${n}</b>`:''}</a>`).join('')}</nav>`;
const TABS=(items,cur)=>`<nav class="axTabs" aria-label="Sections">${items.map(([k,l])=>`<a href="${U({sub:k})}" class="${cur==k?'on':''}" ${cur==k?'aria-current="page"':''}>${l}</a>`).join('')}</nav>`;
const STUB=(t,gap)=>`<div class="axStub">${I('lock')}<div><b>${t} · Not available yet</b>${gap}</div></div>`;
const DL=a=>`<dl class="axDL">${a.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
const MET=(u,l,unit='')=>{if(l==null)return `<span class="mxD g">No limit</span><small>${u}${unit} used</small>`;const p=Math.round(u/l*100),k=p>100?'b':p>=90?'w':'';return `<span class="ax-meter ${k}" style="width:110px" role="meter" aria-valuenow="${u}" aria-valuemax="${l}" aria-label="${u} of ${l}"><i style="width:${Math.min(p,100)}%"></i></span><small>${u}${unit} of ${l}${unit}${k?` · ${p}%`:''}</small>`};
const FLD=(id,l,inp,hint='',cnt='')=>`<div class="fld" id="w-${id}"><label for="${id}">${l}</label>${inp}${hint?`<small class="hint">${hint}</small>`:''}${cnt?`<div class="axCnt" id="c-${id}">${cnt}</div>`:''}</div>`;
const IN=(id,v='',ph='',type='text',ro)=>`<input class="inp" id="${id}" type="${type}" value="${v}" placeholder="${ph}" ${ro?'readonly':''}>`;
const TA=(id,ph='',max=500)=>`<textarea class="inp" id="${id}" rows="3" placeholder="${ph}" maxlength="${max}" oninput="axCount('${id}',${max})"></textarea>`;
const OTP=(id='otp')=>`<div class="axOtp" role="group" aria-label="6-digit code">${[0,1,2,3,4,5].map(i=>`<input inputmode="numeric" maxlength="1" aria-label="Digit ${i+1}" data-otp="${id}" oninput="axOtp(this)">`).join('')}</div>`;
const CODE=()=>STALE?`<div class="axCode" id="w-code"><p><b>Confirm it's you.</b> Enter the 6-digit code from your authenticator app.</p>${OTP('cf')}</div>`:'';
window.axCount=(id,max)=>{const e=document.getElementById('c-'+id);if(e)e.textContent=document.getElementById(id).value.length+' / '+max};
window.axOtp=el=>{el.value=el.value.replace(/\D/g,'');if(el.value&&el.nextElementSibling)el.nextElementSibling.focus()};
const otpVal=k=>[...document.querySelectorAll(`[data-otp="${k}"]`)].map(i=>i.value).join('');
const ERR=(id,msg)=>{const w=document.getElementById('w-'+id);if(!w)return;w.classList.add('bad');if(!w.querySelector('.err'))w.insertAdjacentHTML('beforeend',`<span class="err" role="alert">${msg}</span>`)};
const CLR=root=>root.querySelectorAll('.bad').forEach(w=>{w.classList.remove('bad');w.querySelector('.err')?.remove()});

// ---------- confirm dialogs (one dialog; reason; typed value; checkbox; code only when step-up is stale) ----------
const CFS={};
window.axCf=id=>{const c=CFS[id];let d=document.getElementById('axcf');d?.remove();
 document.body.insertAdjacentHTML('beforeend',`<dialog class="axDlg" id="axcf" aria-labelledby="axcfH"><div class="dh"><h2 id="axcfH">${c.t}</h2><button class="x" aria-label="Close" onclick="document.getElementById('axcf').close()">${I('close')}</button></div><div class="db"><p style="margin:0 0 12px">${c.body}</p>${c.extra||''}${c.typed?FLD('cft',`Type <b>${c.typed}</b> to confirm`,IN('cft','',c.typed)):''}${c.reason?FLD('cfr',c.reason[2]||'Reason',TA('cfr',c.reason[3]||'',c.reason[1]),`${c.reason[0]}–${c.reason[1]} characters. Saved to the audit log.`,`0 / ${c.reason[1]}`):''}${c.chk?`<div id="w-cfk"><label class="axChk"><input type="checkbox" id="cfk"> ${c.chk}</label></div>`:''}${c.code===false?'':CODE()}</div><div class="df"><button class="btn" onclick="document.getElementById('axcf').close()">Cancel</button><button class="btn ${c.danger?'dng':'p'}" onclick="axCfOk('${id}')">${c.ok}</button></div></dialog>`);
 d=document.getElementById('axcf');d.showModal();d.querySelector('input,textarea')?.focus()};
window.axCfOk=id=>{const c=CFS[id],d=document.getElementById('axcf');CLR(d);let ok=true;
 if(c.typed&&$('#cft').value.trim()!==c.typed){ERR('cft',`Type ${c.typed} exactly.`);ok=false}
 if(c.reason){const n=$('#cfr').value.trim().length;if(n<c.reason[0]||n>c.reason[1]){ERR('cfr',`Write a reason of ${c.reason[0]} to ${c.reason[1]} characters.`);ok=false}}
 if(c.chk&&!$('#cfk').checked){ERR('cfk','Tick the box to continue.');ok=false}
 if(c.code!==false&&STALE&&!/^\d{6}$/.test(otpVal('cf'))){ERR('code','Enter the 6 digits from your authenticator app.');ok=false}
 if(!ok){d.querySelector('.bad input,.bad textarea')?.focus();return}
 d.close();toast2(c.toast,{kind:'ok',sub:c.sub||''});c.after&&c.after()};

// ---------- drawers ----------
const DRS={};
window.axDrw=id=>{const c=DRS[id];if(!c)return;let h=document.getElementById('axdr-h');if(!h){document.body.insertAdjacentHTML('beforeend','<div id="axdr-h"></div>');h=document.getElementById('axdr-h')}
 h.innerHTML=`<div class="axDS" onclick="axDrwX()"></div><aside class="axDr" role="dialog" aria-modal="true" aria-labelledby="axdrH"><div class="dh"><h2 id="axdrH">${c.t}</h2><button class="x" aria-label="Close" onclick="axDrwX()">${I('close')}</button></div><div class="db">${typeof c.body=='function'?c.body():c.body}</div>${c.foot?`<div class="df">${c.foot}</div>`:''}</aside>`;
 requestAnimationFrame(()=>{h.querySelector('.axDS').classList.add('on');h.querySelector('.axDr').classList.add('on');h.querySelector('.axDr input,.axDr select,.axDr textarea,.axDr .x')?.focus()})};
window.axDrwX=()=>{const h=document.getElementById('axdr-h');if(!h)return;h.querySelector('.axDS')?.classList.remove('on');h.querySelector('.axDr')?.classList.remove('on');setTimeout(()=>h.innerHTML='',250)};
document.addEventListener('keydown',e=>{if(e.key=='Escape')axDrwX()});
// form validation in drawers: rules = [[fieldId,min,max,message]]
const FMS={};
window.axForm=id=>{const f=FMS[id],root=document.querySelector('.axDr')||document;CLR(root);const bad=[];
 f.rules.forEach(([fid,min,max,msg])=>{const el=document.getElementById(fid);if(!el)return;const v=el.type=='checkbox'?(el.checked?'x':''):el.value.trim();const n=el.type=='number'?+v:v.length;if(!v||n<min||n>max){ERR(fid,msg);bad.push([fid,msg])}});
 if(f.code&&STALE&&!/^\d{6}$/.test(otpVal('cf'))){ERR('code','Enter the 6 digits from your authenticator app.');bad.push(['code','Enter your 6-digit code.'])}
 const s=root.querySelector('.axSum');s?.remove();
 if(bad.length){root.querySelector('.db')?.insertAdjacentHTML('afterbegin',`<div class="axSum" role="alert" tabindex="-1"><b>Fix ${bad.length} ${bad.length>1?'problems':'problem'} to continue</b>${bad.map(b=>`<a href="#${b[0]}">${b[1]}</a>`).join('<br>')}</div>`);root.querySelector('.axSum').focus();return}
 if(f.confirm){axDrwX();setTimeout(()=>axCf(f.confirm),260);return}
 axDrwX();toast2(f.toast,{kind:'ok',sub:f.sub||''});f.after&&f.after()};

// ---------- top bar, banner, session ----------
const CHIP={fresh:['g','Verified · 12 min'],stale:['bl','Signed in'],none:['n','Not signed in'],mismatch:['a','Session mismatch']}[SESS]||['g','Verified · 12 min'];
$('header.top').innerHTML=`<div class="axTB"><button class="axMenu" onclick="$('#mOpen')?.click()" aria-label="Open menu">${I('menu')}Menu</button><span class="lbl"><img src="../../assets/brand/vo-mark-white.svg" alt=""><span class="full">Platform administration</span><span class="sh" style="display:none">Admin</span></span><span class="sp"></span>
<span class="axChip ${CHIP[0]}" role="status" aria-label="Session: ${CHIP[1]}"><i></i><span class="t">${CHIP[1]}</span></span>${SESS=='none'?`<button class="axSI" onclick="axSignIn()">Sign in</button>`:''}
<a class="ex" href="index.html">${I('logout')}<span>Exit</span></a>
<details class="axAv"><summary aria-label="Account menu">JR</summary><div class="m"><div class="who"><b>jordan@casevoya.ca</b><small>${ROLE[0].toUpperCase()+ROLE.slice(1)}${ROLE=='owner'?'':''} · Access email</small></div>
<button onclick="axStepUp()">${I('key')}Verify with 6-digit code</button><button onclick="toast2('Signed out of the admin portal',{sub:'Your Cloudflare Access sign-in is still active.'})">${I('logout')}Sign out</button><a href="/cdn-cgi/access/logout">${I('external-link')}Sign out of Access</a></div></details></div>`;
if(innerWidth<768){const s=$('.axTB .sh');if(s)s.style.display='inline'}
const BANNER=`<div class="axBan" role="note">${I('eye-off')}<span>Operational metadata only. No client content is shown here. Client content needs a firm-approved, time-limited support grant; there is no impersonation.</span></div>`;
// sign-in + step-up dialogs (spec §3.2 / §3.3)
document.body.insertAdjacentHTML('beforeend',`<dialog class="axDlg" id="axsi" aria-labelledby="axsiH"><div class="dh"><h2 id="axsiH">Sign in to the admin portal</h2><button class="x" aria-label="Close" onclick="axsi.close()">${I('close')}</button></div><div class="db"><p style="margin:0 0 12px">Use the password and authenticator app for your Access email.</p>${FLD('siE','Access email',IN('siE','jordan@casevoya.ca','','email',1),'This is the email Cloudflare Access signed you in with.')}${FLD('siP','Password',IN('siP','','','password'))}<div class="fld" id="w-code"><label>6-digit code</label>${OTP('si')}</div></div><div class="df"><button class="btn" onclick="axsi.close()">Cancel</button><button class="btn p" onclick="axSiOk()">Sign in</button></div></dialog>
<dialog class="axDlg" id="axsu" aria-labelledby="axsuH"><div class="dh"><h2 id="axsuH">Confirm it's you</h2><button class="x" aria-label="Close" onclick="axsu.close()">${I('close')}</button></div><div class="db"><p style="margin:0 0 12px">Enter the 6-digit code from your authenticator app. You won't be asked again for 15 minutes.</p><div class="fld" id="w-su"><label>6-digit code</label>${OTP('su')}</div></div><div class="df"><button class="btn" onclick="axsu.close()">Cancel</button><button class="btn p" onclick="axSuOk()">Verify</button></div></dialog>`);
window.axSignIn=()=>{axsi.showModal();$('#siP').focus()};window.axStepUp=()=>{axsu.showModal();axsu.querySelector('input').focus()};
window.axSiOk=()=>{CLR(axsi);let ok=true;if(!$('#siP').value){ERR('siP','Enter your password.');ok=false}if(!/^\d{6}$/.test(otpVal('si'))){ERR('code','That code didn\u2019t match. Codes change every 30 seconds; try the current one.');ok=false}if(ok){axsi.close();toast2('Signed in',{kind:'ok',sub:'Verified for 15 minutes.'})}};
window.axSuOk=()=>{CLR(axsu);if(!/^\d{6}$/.test(otpVal('su'))){ERR('su','That code didn\u2019t match. Codes change every 30 seconds; try the current one.');return}axsu.close();toast2('Verified',{kind:'ok',sub:'Good for 15 minutes.'})};
document.addEventListener('click',e=>{const tr=e.target.closest('tr[data-go]');if(tr&&!e.target.closest('button,a,input,select,label')){const g=tr.dataset.go;g.startsWith('drw:')?axDrw(g.slice(4)):location.href=g}});
document.addEventListener('keydown',e=>{const tr=e.target.closest&&e.target.closest('tr[data-go]');if(tr&&e.key=='Enter')tr.click()});
// ---------- demo data (counts are consistent across pages) ----------
const FIRMS=[
 {id:'f5',n:'Maple Pathways',lg:'Maple Pathways Consulting',plan:'Solo',v:'Pending review',s:'Trialing',r:['trial_ending'],m:1,c:'24 Oct 2026',sample:1,kd:'Trial ends 1 Nov'},
 {id:'f6',n:'Fraser Consulting',lg:'Fraser Immigration Consulting Corp.',plan:'Solo',v:'Verified',s:'Active',r:['cancel_scheduled'],m:2,c:'15 Sep 2026',kd:'Cancels 30 Nov'},
 {id:'f4',n:'Old Town Immigration',lg:'Old Town Immigration Consulting Inc.',plan:'Solo',v:'Restricted',s:'Restricted',r:['restricted'],m:1,c:'8 Apr 2026',kd:'Restricted since 22 Oct'},
 {id:'f1',n:'Northline Immigration',lg:'Northline Immigration Services Inc.',plan:'Practice',v:'Verified',s:'Active',r:[],m:6,c:'12 Mar 2026'},
 {id:'f2',n:'Harbourview Legal',lg:'Harbourview Legal LLP',plan:'Firm',v:'Verified',s:'Active',r:[],m:18,c:'3 Feb 2026'},
 {id:'f3',n:'Lakeside Visa Services',lg:'Lakeside Visa Services Ltd.',plan:'Practice',v:'Verified',s:'Past due',r:['past_due','invoice_unpaid'],m:4,c:'21 Jan 2026',kd:'Due since 19 Oct'}];
const FBY=id=>FIRMS.find(f=>f.id==id)||FIRMS[5];
const RS={past_due:['b','Past due'],invoice_unpaid:['b','Invoice unpaid'],restricted:['b','Restricted'],trial_ending:['','Trial ending'],trial_ended:['','Trial ended'],cancel_scheduled:['','Cancel scheduled']};
const RC=r=>`<span class="rc ${RS[r][0]}">${RS[r][1]}</span>`;
const VB=v=>B(v=='Verified'?'':v=='Restricted'?'b':'w',v);
const SB=s=>B(s=='Active'?'':s=='Trialing'?'n':s=='Past due'||s=='Restricted'?'b':'w',s);
const SMP=f=>f.sample?' '+B('n','Sample'):'';
const FN=f=>`<a href="${U({tab:'firms',id:f.id})}" style="color:#111;font-weight:600;text-decoration:none">${f.n}</a>${SMP(f)}<small>${f.lg}</small>`;
const GR=[
 {id:'g1',f:'f3',sc:'matter_documents',mt:'M-2026-0142',tk:'SUP-4471',by:'Kenji Ito',min:60,st:'Pending',ap:'—',end:'—',ext:0,use:0,why:'Client reports an upload stuck at 0%. Need to see the document record to find the failed step.'},
 {id:'g2',f:'f1',sc:'firm_settings',mt:'—',tk:'SUP-4466',by:'Mina Haddad',min:60,st:'Active',ap:'1:31 PM EDT by owner A. Mensah',end:'2:31 PM EDT',left:'26 min left',ext:0,use:3,why:'Firm asked us to check why invoice numbering restarted.'},
 {id:'g3',f:'f2',sc:'matter_records',mt:'M-2026-0098',tk:'SUP-4430',by:'Kenji Ito',min:30,st:'Ended',ap:'27 Oct, 10:02 AM EDT',end:'27 Oct, 10:32 AM EDT',ext:0,use:5},
 {id:'g4',f:'f6',sc:'matter_all',mt:'M-2026-0011',tk:'SUP-4402',by:'Mina Haddad',min:120,st:'Declined',ap:'—',end:'—',ext:0,use:0},
 {id:'g5',f:'f1',sc:'firm_settings',mt:'—',tk:'SUP-4390',by:'Jordan Reid',min:60,st:'Expired',ap:'—',end:'—',ext:0,use:0}];
const GB=s=>B(s=='Active'?'':s=='Pending'?'w':s=='Declined'?'b':'g',s);

// ---------- 2.1 Overview ----------
const PGS={};
PGS.overview=()=>{const mob=innerWidth<768;
 const cards={
  firms:C('building','Firms','6',{sub:'5 live · 1 sample',href:U({tab:'firms'}),viz:BAR([[5,'f','Live'],[1,'n','Sample']],6)+`<div class="mxSc"><span>Verified 4 · Pending 1 · Restricted 1</span></div>`}),
  subs:C('credit-card','Subscription exceptions','4',{href:U({tab:'subscriptions'}),viz:`<div style="margin-top:10px">${RC('past_due')}${RC('invoice_unpaid')}${RC('restricted')}${RC('trial_ending')}${RC('cancel_scheduled')}</div>`}),
  queues:C('health','Queues','Unhealthy',{sm:1,d:B('b','2 dead letters'),href:U({tab:'health'}),sub:'12 pending · 1 processing · oldest 40 s',viz:BAR([[12,'f','Pending'],[1,'n','Processing'],[2,'r','Dead-lettered']],15)}),
  lic:C('id-card','Licences','2',{d:B('w','due'),href:U({tab:'verification'}),sub:'Adverse 0 · Needs review 1 · Never checked 0',viz:DOTS([[2,'on'],[1,'on'],[9,'ok']])+`<div class="mxSc"><span>12 credentials · 9 current</span></div>`}),
  ver:C('user-check','Verification workload','4',{href:U({tab:'verification'}),sub:'1 firm pending review · 3 licence checks'}),
  inc:C('incident','Incident status','Operational',{sm:1,d:B('','No active incidents'),href:U({tab:'incidents'}),sub:'Maintenance scheduled 2 Nov, 11:00 PM EDT'}),
  sup:C('key','Support access','1 active',{sm:1,d:B('w','1 pending'),href:U({tab:'grants'}),sub:'First response: median 38 min · 1 of 24 over target (30 d)'}),
  tpl:C('templates','Templates awaiting review','1',{href:U({tab:'releases',sub:'templates'}),sub:'Retainer agreement · v4 draft'}),
  cmp:`<a class="mxC" href="#" onclick="event.preventDefault();axDrw('cmp')"><div class="mxT">${I('alarm')}<span>Complaints overdue</span></div><div class="mxN">1${B('b','acknowledgement')}</div><div class="mxS">0 response overdue · by firm ›</div></a>`};
 DRS.cmp={t:'Complaints overdue by firm',body:T_(['Firm','Ack overdue','Response overdue'],[[FN(FBY('f3')),'1','0']])+'<p class="axNote">Counts only. Complaint content stays inside the firm.</p>'};
 const order=mob?['queues','inc','firms','subs','lic','ver','sup','tpl','cmp']:['firms','subs','queues','lic','ver','inc','sup','tpl','cmp'];
 const grid=mob?`<div class="mxG5">${order.map(k=>cards[k]).join('')}</div>`:`<div class="mxG5">${order.slice(0,5).map(k=>cards[k]).join('')}</div><div class="mxG4">${order.slice(5).map(k=>cards[k]).join('')}</div>`;
 const nf=FIRMS.slice(0,5).map(f=>`<li><span class="ki">${I('building')}</span><span><a href="${U({tab:'firms',id:f.id})}" style="color:#111;font-weight:600;text-decoration:none">${f.n}</a>${SMP(f)}<small>${f.plan} · created ${f.c}</small></span><span class="bd">${VB(f.v)}</span></li>`).join('');
 const gl=GR.filter(g=>g.st=='Pending'||g.st=='Active').map(g=>`<li><span class="ki">${I('key')}</span><span><a href="${U({tab:'grants',id:g.id})}" style="color:#111;font-weight:600;text-decoration:none">${FBY(g.f).n}</a><small>${g.sc} · ${g.tk} · ${g.by}</small></span><span class="bd">${GB(g.st)}${g.left?` <small style="display:inline;color:#6b6762">${g.left}</small>`:''}</span></li>`).join('');
 return H('Operations','Live counts across every firm. Checked 2:05 PM (EDT).',Bt('Refresh',{ic:'refresh',on:"toast2('Refreshed')"}))+grid+
 `<div class="mxG2">${P('building','Newest firms',`<ul class="axGL">${nf}</ul>`,`<a href="${U({tab:'firms'})}" style="color:#0075DE">All firms</a>`)}${P('key','Support grants',`<ul class="axGL">${gl}</ul><div class="axImp">${I('shield')}There is no impersonation button. Client content needs a firm-approved, time-limited support grant.</div>`,`<a href="${U({tab:'grants'})}" style="color:#0075DE">All grants</a>`)}</div>`};
const T_=(c,r,o)=>T(c,r,o);

// ---------- 2.2 Firms + detail ----------
PGS.firms=()=>{if(RID)return FIRM(FBY(RID));
 return H('Firms','Every firm on Casevoya. Read-only: support works through grants, never by signing in as a firm.')+
 FILT('Search firm name or legal name',SEL('fv','Verification',['All','Verified','Pending review','Restricted','Rejected'])+SEL('fs','Subscription',['All','Active','Trialing','Past due','Restricted','Cancelled'])+SEL('fp','Plan',['All','Solo','Practice','Firm','Enterprise'])+SEL('fsm','Sample',['All','Live only','Sample only'])+SEL('fo','Sort',['Newest','Oldest','Name A–Z']))+
 P('building','Firms',T(['Firm','Plan','Verification','Subscription','Members','Created'],FIRMS.map(f=>[FN(f),f.plan,VB(f.v),SB(f.s)+(f.r.length?'<br>'+f.r.map(RC).join(''):''),f.m,f.c]),{go:FIRMS.map(f=>U({tab:'firms',id:f.id})),pg:'1–6 of 6'}),'6 firms')};
const FIRM=f=>{DRS.ask={t:'Ask for support access',body:GFORM(f.n),foot:Bt('Cancel',{on:'axDrwX()'})+Bt('Send request',{p:1,on:"axForm('grant')"})};
 return H(f.n,`${f.lg} · ${f.plan} plan · created ${f.c}`,IFOP(Bt('Ask for support access',{p:1,ic:'key',on:"axDrw('ask')"})),`<a href="${U({tab:'firms'})}">Firms</a>›<span>${f.n}</span>`)+
 `<div style="margin:-6px 0 16px;display:flex;gap:6px;flex-wrap:wrap">${VB(f.v)}${SB(f.s)}${f.sample?B('n','Sample'):''}</div>`+
 `<div class="mxG2"><div>`+
 P('building','Account',`<div class="axPad">${DL([['Legal name',f.lg],['Firm id',`<span class="mono">org_${f.id}8c2e41</span>`],['Verification',VB(f.v)],['Created',f.c],['Province','Ontario'],['Sample data',f.sample?'Yes':'No']])}</div>`)+
 P('credit-card','Subscription',`<div class="axPad">${DL([['Status',SB(f.s)],['Plan · interval',f.plan+' · monthly'],['Period ends','30 Nov 2026'],['Exceptions',f.r.length?f.r.map(RC).join(''):'None'],['Stripe',`<a href="https://dashboard.stripe.com/customers/cus_demo" target="_blank" rel="noopener">Open in Stripe ${I('external-link')}</a>`]])}</div>`+T(['Invoice','Amount','Status','Date'],[['in_1Q8x…','CA$149.00',f.s=='Past due'?B('b','Open'):B('','Paid'),'1 Oct 2026'],['in_1Pz2…','CA$149.00',B('','Paid'),'1 Sep 2026']])+`<div class="axPad"><b style="font-size:13px">Recent events</b><ul class="axTL" style="margin-top:6px"><li><time>19 Oct, 9:12 AM EDT</time><span>invoice.payment_failed</span></li><li><time>1 Oct, 9:00 AM EDT</time><span>invoice.created</span></li></ul></div>`)+
 P('id-card','Licences',T(['Holder','College ID','Status','Next review'],[['Owner',`<span class="mono">R712345</span>`,B('','Active'),'14 Jan 2027'],['Consultant',`<span class="mono">R705518</span>`,B('w','Needs review'),'Overdue']],{go:[U({tab:'verification',id:'c1'}),U({tab:'verification',id:'c2'})]}))+
 P('history','Audit',T(['Time','Action','Actor'],[['28 Oct, 4:10 PM EDT','support_access.approved','owner'],['27 Oct, 11:02 AM EDT','licence.checked','kenji@casevoya.ca']]),`<a href="${U({tab:'audit'})}" style="color:#0075DE">Open audit log</a>`)+
 `</div><div>`+
 P('users','People',`<div class="axPad">${DL([['Owners','1'],['Admins','1'],['Staff',String(f.m-2>0?f.m-2:0)],['Pending invites','1']])}<p class="axNote">Counts only. Names and emails of firm staff are not shown.</p></div>`)+
 P('key','Support',`<div class="axPad"><p style="margin:0 0 10px;font-size:14px">No active support access for this firm.</p>${IFOP(Bt('Ask for support access',{ic:'key',on:"axDrw('ask')"}))}</div>`)+
 P('dashboard','Usage',`<div class="axPad" style="display:grid;gap:12px">${['Seats','Matters','Storage'].map((k,i)=>`<div><div style="font-size:13px;margin-bottom:4px">${k}</div>${[MET(f.m,f.plan=='Solo'?2:10),MET(38,100),MET(4.2,20,' GB')][i]}</div>`).join('')}<div style="font-size:13px">AI (30 d): 112 runs · 2 failed · US$7.40</div></div>`)+
 P('health','Health',`<div class="axPad" style="font-size:14px">${f.id=='f3'?`1 dead letter for this firm. <a href="${U({tab:'health'})}">Open Health</a>`:'No dead letters for this firm.'}</div>`)+
 P('alarm','Complaints',`<div class="axPad">${DL([['Open','1'],['Acknowledgement overdue',f.id=='f3'?'1':'0'],['Response overdue','0']])}</div>`)+
 P('bell','Notices',`<div class="axPad" style="font-size:14px">Sees: Scheduled maintenance · 2 Nov (all firms).</div>`)+
 `</div></div>`};

// ---------- 2.3 Subscriptions ----------
const EXC=FIRMS.filter(f=>f.r.length).sort((a,b)=>b.r.some(r=>RS[r][0]=='b')-a.r.some(r=>RS[r][0]=='b'));
PGS.subscriptions=()=>{const tab=SUB||'exceptions';
 return H('Subscriptions','Firms whose billing needs attention. Billing changes happen in Stripe, not here.')+
 `<div class="axChips"><span class="c">Active 3</span><span class="c">Trialing 1</span><span class="c b">Past due 1</span><span class="c b">Restricted 1</span></div><div class="axChips">${['past_due','invoice_unpaid','restricted','trial_ending','cancel_scheduled'].map(r=>`<span class="c ${RS[r][0]||'w'}">${RS[r][1]} 1</span>`).join('')}</div>`+
 TABS([['exceptions','Exceptions (4)'],['all','All firms (6)']],tab)+
 (tab=='all'?P('credit-card','All firms by subscription',T(['Firm','Status','Plan · interval','Period ends','Updated'],FIRMS.map(f=>[FN(f),SB(f.s),f.plan+' · monthly','30 Nov 2026','28 Oct 2026'])))
 :P('alert','Exceptions',T(['Firm','Status','Plan · interval','Reasons','Key date','Latest invoice','Stripe','Updated'],EXC.map(f=>[FN(f),SB(f.s),f.plan+' · monthly',f.r.map(RC).join(''),f.kd,f.s=='Past due'?'CA$149.00 · open':'CA$49.00 · paid',`<a href="https://dashboard.stripe.com/" target="_blank" rel="noopener" aria-label="Open ${f.n} in Stripe">${I('external-link')}</a>`,'28 Oct 2026']),{go:EXC.map(f=>U({tab:'firms',id:f.id}))}),'4 firms'))};

// ---------- 2.4 Usage ----------
PGS.usage=()=>{DRS.allow={t:'Plan allowances',body:T(['Plan','Seats','Matters','Storage'],[['Trial','No plan limit','No plan limit','No plan limit'],['Solo','2','100','20 GB'],['Practice','10','1,000','200 GB'],['Firm','30','No limit','1 TB'],['Enterprise','No limit','No limit','No limit']])};
 const R=[['f2',18,30,'612',null,420,1000,'640 runs · 6 failed · US$41.20'],['f1',6,10,'214',1000,96,200,'301 runs · 1 failed · US$19.90'],['f3',4,10,'180',1000,188,200,'190 runs · 4 failed · US$12.10'],['f4',1,2,'104',100,21,20,'48 runs · 0 failed · US$3.80'],['f6',2,2,'31',100,4,20,'105 runs · 2 failed · US$9.40'],['f5',1,null,'9',null,0.4,null,'0 runs']];
 return H('Usage','Seats, matters, storage and AI use per firm against plan limits. Amber at 90 %, red when over.',Bt('Plan allowances',{ic:'info',on:"axDrw('allow')"}))+
 `<div class="mxG4">${C('users','Seats in use','32')}${C('folder','Matters','1,150')}${C('database','Storage','729 GB')}${C('sparkles','AI · 30 days','1,284',{sub:'13 failed · US$86.40'})}</div>`+
 `<div class="axChips"><span class="c b">2 flagged (near or over a limit)</span></div>`+
 FILT('Search firm',SEL('up','Plan',['All','Solo','Practice','Firm','Enterprise'])+SEL('uf','Show',['All firms','Flagged only']))+
 P('dashboard','Firms',T(['Firm','Plan','Seats','Matters','Storage','AI (30 d)'],R.map(([id,s,sl,m,ml,g,gl,ai])=>{const f=FBY(id);return [FN(f),f.plan,MET(s,sl),ml==null?`<span class="mxD g">${f.s=='Trialing'?'Trial: no plan limit':'No limit'}</span><small>${m} matters</small>`:MET(+m,ml),MET(g,gl,' GB'),ai]}),{pg:'1–6 of 6'}))};
// ---------- 2.5 Verification ----------
const CR=[
 {id:'c2',f:'f1',t:'RCIC',cid:'R705518',st:'Active',rs:'Active',bk:'Needs review',lr:B('w','Needs review'),ck:'27 Oct 2026',nx:'Overdue',vu:'31 Dec 2026',mt:'Manual',role:'Consultant'},
 {id:'c3',f:'f5',t:'RCIC-IRB',cid:'R719902',st:'Unverified',rs:'—',bk:'Never checked',lr:'—',ck:'—',nx:'Now',vu:'—',mt:'—',role:'Owner'},
 {id:'c1',f:'f3',t:'RCIC',cid:'R712345',st:'Active',rs:'Active',bk:'Due',lr:B('','Current'),ck:'14 Jul 2026',nx:'30 Oct 2026',vu:'31 Dec 2026',mt:'CICC list',role:'Owner'},
 {id:'c4',f:'f2',t:'RCIC',cid:'R701177',st:'Active',rs:'Active',bk:'Due',lr:B('','Current'),ck:'2 Aug 2026',nx:'2 Nov 2026',vu:'31 Dec 2026',mt:'Manual',role:'Consultant'}];
const CRF={'Needs review':'w','Never checked':'w','Due':'n','Adverse':'b','Overdue':'b'};
PGS.verification=()=>{if(RID)return CRED(CR.find(c=>c.id==RID)||CR[2]);const tab=SUB||'queue',seg=Q.get('seg')||'all';
 DRS.cicc={t:'Upload CICC list',body:()=>CICC(1)};
 return H('Verification','Firm verification and licence checks against the CICC public register.')+
 `<div class="mxG4">${C('building','Firms pending review','1',{href:U({sub:'firms'})})}${C('alarm','Licences due','2',{d:B('w','within 7 days')})}${C('alert','Needs review','1')}${C('x-circle','Adverse','0',{d:B('','none')})}</div>`+
 TABS([['queue','Licence queue'],['cicc','CICC list'],['firms','Firms']],tab)+
 (tab=='cicc'?P('file','CICC list',`<div class="axPad">${DL([['Current list','Imported 14 Oct 2026, 9:40 AM EDT by kenji@casevoya.ca'],['Rows','9,812 licensees'],['Source','college-ic.ca public register export (CSV)'],['Matches','11 of 12 credentials matched']])}<div style="margin-top:14px">${IFOP(Bt('Upload CSV',{p:1,ic:'upload',on:"axDrw('cicc')"}))}</div><p class="axNote">Two steps: a dry run shows what would change; nothing is saved until you choose Import.</p></div>`)
 :tab=='firms'?P('building','Firms by verification',T(['Firm','Verification','Submitted','Licences'],FIRMS.map(f=>[FN(f),VB(f.v),f.c,f.id=='f5'?'1 never checked':'Current'])))
 :SEG([['adverse','Adverse',0],['needs','Needs review',1],['never','Never checked',1],['overdue','Overdue',1],['due','Due',2],['all','All',4]],seg)+P('id-card','Licence queue',T(['Firm','Type','College ID','Status','Register status','Bucket','Latest result','Checked','Next review','Valid until','Method','Member role'],CR.map(c=>[FN(FBY(c.f)),c.t,`<span class="mono">${c.cid}</span>`,c.st,c.rs,B(CRF[c.bk]||'g',c.bk),c.lr,c.ck,c.nx,c.vu,c.mt,c.role]),{go:CR.map(c=>U({id:c.id}))})))};
const CICC=step=>step==1?`<div class="fld"><label for="cf1">CSV file</label><input class="inp" type="file" id="cf1" accept=".csv"></div><button class="btn p" onclick="document.querySelector('.axDr .db').innerHTML=CICC(2)">Dry run</button><p class="axNote">Step 1 of 2. Nothing is saved yet.</p>`
 :`<div class="axCode" style="background:#f6f5f4;border-color:#ebe8e4"><p><b>Dry run: cicc-register-2026-10-29.csv</b></p>${DL([['Rows read','9,840'],['New licensees','31'],['Status changed','4'],['Removed from list','3'],['Rows rejected','0'],['Credentials affected','1 (R705518: Active → Suspended)']])}</div>${CODE()}<div style="display:flex;gap:8px;margin-top:14px"><button class="btn" onclick="document.querySelector('.axDr .db').innerHTML=CICC(1)">Back</button><button class="btn p" onclick="axDrwX();toast2('CICC list imported',{kind:'ok',sub:'9,840 rows · 1 credential needs review'})">Import</button></div><p class="axNote">Step 2 of 2.</p>`;
const CRED=c=>{const f=FBY(c.f);
 DRS.chk={t:'Record manual check',body:`<p style="margin:0 0 12px;font-size:14px">Look up <span class="mono">${c.cid}</span> on <a href="https://register.college-ic.ca/" target="_blank" rel="noopener">register.college-ic.ca ${I('external-link')}</a> and record what it shows.</p>${FLD('mR','Retrieved at',IN('mR','2026-10-29T14:05','','datetime-local'))}${FLD('mS','Register status',`<select class="sel" id="mS"><option value="">Choose…</option><option>Active</option><option>Inactive</option><option>Not found</option></select>`)}<label class="axChk"><input type="checkbox" checked> Entitled to practise</label><label class="axChk"><input type="checkbox"> Suspended</label><label class="axChk"><input type="checkbox"> Revoked</label><label class="axChk"><input type="checkbox"> Restricted</label>${FLD('mD','Restriction detail',TA('mD','',500),'Only when restricted.')}${FLD('mP','Proof locator',IN('mP','','Screenshot file name or register page URL'),'Where the evidence is kept. Required.')}${FLD('mN','Notes',TA('mN','',1000))}<div class="axCode" style="background:#e8f5ec;border-color:#bfe3cb"><p style="margin:0"><b>Result preview:</b> Current · next review 27 Jan 2027</p></div>${CODE()}`,foot:Bt('Cancel',{on:'axDrwX()'})+Bt('Record check',{p:1,on:"axForm('chk')"})};
 FMS.chk={rules:[['mS',1,40,'Choose the register status.'],['mP',3,500,'Add where the proof is kept.']],code:1,toast:'Check recorded',sub:'Next review 27 Jan 2027'};
 return H(`${c.t} · ${c.cid}`,`${f.n} · ${c.role}`,IFOP(Bt('Check against CICC list',{ic:'refresh',on:"toast2('Matched on CICC list',{kind:'ok',sub:'"+c.cid+" · Active · list of 14 Oct'})"})+Bt('Record manual check',{p:1,ic:'file-check',on:"axDrw('chk')"})),`<a href="${U({id:''})}">Verification</a>›<span>${c.cid}</span>`)+
 `<div class="mxG2">${P('id-card','Credential',`<div class="axPad">${DL([['Firm',FN(f)],['Type',c.t],['College ID',`<span class="mono">${c.cid}</span>`],['Status',c.st],['Register status',c.rs],['Bucket',B(CRF[c.bk]||'g',c.bk)],['Valid until',c.vu],['Next review',c.nx]])}</div>`)}
 ${P('history','Checks',`<div class="axPad"><ul class="axTL"><li><time>27 Oct 2026, 11:02 AM EDT</time><span>${B('w','Needs review')} Manual · kenji@casevoya.ca<br><small>Register shows a condition note. Proof: reg-R705518-2026-10-27.png</small></span></li><li><time>14 Jul 2026, 9:40 AM EDT</time><span>${B('','Current')} CICC list match</span></li><li><time>12 Mar 2026, 3:15 PM EDT</time><span>${B('','Current')} Manual · mina@casevoya.ca</span></li></ul></div>`)}</div>`};

// ---------- 2.6 Grants ----------
const GFORM=(firm='')=>`<p style="margin:0 0 12px;font-size:14px">The firm's owners decide. Nothing opens until one of them approves.</p>${FLD('gF','Firm',`<select class="sel" id="gF"><option value="">Choose a firm…</option>${FIRMS.map(f=>`<option ${f.n==firm?'selected':''}>${f.n}</option>`).join('')}</select>`)}<div class="fld"><label>Scope</label><div class="axRadio">${['firm_settings','matter_documents','matter_records','matter_all'].map((s,i)=>`<label><input type="radio" name="gS" ${i==0?'checked':''}> ${s}</label>`).join('')}</div></div>${FLD('gM','Matter id',IN('gM','','M-2026-0142'),'Needed for matter scopes.')}${FLD('gN','Requester name',IN('gN','Jordan Reid'))}${FLD('gE','Requester email',IN('gE','jordan@casevoya.ca','','email'))}${FLD('gT','Ticket reference',IN('gT','','SUP-4471'),'Up to 60 characters.')}${FLD('gX','Not included',TA('gX','What you will not look at',500))}${FLD('gR','Reason',TA('gR','What you need to see and why',1000),'8–1000 characters. The firm sees this.','0 / 1000')}${FLD('gMin','Minutes',IN('gMin','60','','number'),'15–240 minutes.')}<label class="axChk" id="w-gOk"><input type="checkbox" id="gOk"> The firm's owners will be emailed and must approve</label>`;
FMS.grant={rules:[['gF',1,99,'Choose a firm.'],['gR',8,1000,'Write a reason of 8 to 1000 characters.'],['gMin',15,240,'Minutes must be 15 to 240.'],['gOk',1,1,'Tick the box to confirm the owners must approve.']],toast:'Request sent',sub:'The firm\u2019s owners must approve it.'};
PGS.grants=()=>{if(RID)return GRANT(GR.find(g=>g.id==RID)||GR[1]);const tab=SUB||'pending';
 DRS.req={t:'Request access',body:GFORM(),foot:Bt('Cancel',{on:'axDrwX()'})+Bt('Send request',{p:1,on:"axForm('grant')"})};
 const L=GR.filter(g=>tab=='all'||(tab=='pending'&&g.st=='Pending')||(tab=='active'&&g.st=='Active')||(tab=='closed'&&!['Pending','Active'].includes(g.st)));
 return H('Grants','Firm-approved, time-limited support access. There is no impersonation.',IFOP(Bt('Request access',{p:1,ic:'key',on:"axDrw('req')"})))+
 TABS([['pending','Pending (1)'],['active','Active (1)'],['closed','Closed (3)'],['all','All (5)']],tab)+
 P('key','Support access',T(['Firm','Scope','Matter id','Ticket','Requested by','Minutes asked','Status','Approved','Ends','Extensions','Uses'],L.map(g=>[FN(FBY(g.f)),`<span class="mono">${g.sc}</span>`,g.mt,g.tk,g.by,g.min,GB(g.st),g.ap,g.left?`${g.end}<small>${g.left}</small>`:g.end,g.ext,g.use]),{go:L.map(g=>U({id:g.id}))}))};
const GRANT=g=>{const f=FBY(g.f);
 CFS.end={t:'End access now?',body:`Support access to ${f.n} stops immediately. The firm's owners are told.`,reason:[3,500,'Reason'],ok:'End access now',danger:1,toast:'Access ended'};
 CFS.wd={t:'Withdraw this request?',body:`${f.n}'s owners will no longer be asked to approve it.`,reason:[3,500,'Reason'],ok:'Withdraw request',toast:'Request withdrawn'};
 const act=g.st=='Active'?Bt('End access now',{cls:'dng',on:"axCf('end')"}):g.st=='Pending'?Bt('Withdraw request',{on:"axCf('wd')"}):'';
 return H(`Support access · ${f.n}`,`${g.sc} · ${g.tk}`,IFOP(act),`<a href="${U({id:''})}">Grants</a>›<span>${g.tk}</span>`)+`<div style="margin:-6px 0 16px">${GB(g.st)} ${g.left?`<b style="font-size:14px">${g.left}</b>`:''}</div>`+
 `<div class="mxG2">${P('key','Request',`<div class="axPad">${DL([['Firm',FN(f)],['Scope',`<span class="mono">${g.sc}</span>`],['Matter id',g.mt],['Ticket',g.tk],['Requested by',g.by],['Minutes asked',g.min],['Approved',g.ap],['Ends',g.end],['Extensions',g.ext],['Uses',g.use]])}<p style="font-size:14px;margin:14px 0 0"><b>Reason</b><br>${g.why||'Investigate a reported issue.'}</p></div>`)}
 ${P('history','Timeline',`<div class="axPad"><ul class="axTL"><li><time>1:12 PM EDT</time><span>Requested by ${g.by}</span></li><li><time>1:13 PM EDT</time><span>Firm owners emailed</span></li>${g.st=='Active'?`<li><time>1:31 PM EDT</time><span>Approved by owner A. Mensah for 60 min</span></li><li><time>1:40 PM EDT</time><span>Used: viewed firm settings (3 times)</span></li>`:''}</ul></div>`)}</div>`};

// ---------- 2.7 Health ----------
const DLS=[{id:'d1',et:'notification.email.send',f:'f1',at:8,oc:'29 Oct, 12:44 PM EDT',err:'smtp 554: mailbox unavailable (recipient rejected)',k:['notification_id','template','recipient_role','locale'],b:412},
 {id:'d2',et:'stripe.webhook.invoice_payment_failed',f:'f3',at:8,oc:'29 Oct, 9:15 AM EDT',err:'upstream timeout after 30000 ms',k:['stripe_event_id','invoice_id','attempt_count'],b:288}];
PGS.health=()=>{const et=Q.get('et')||'';const L=DLS.filter(d=>!et||d.et==et);
 L.forEach(d=>{DRS[d.id]={t:d.et,body:`${DL([['Status',B('b','dead_lettered')],['Firm',FN(FBY(d.f))],['Attempts',d.at],['Occurred',d.oc],['Aggregate',`<span class="mono">${d.id=='d1'?'notification':'subscription'}</span>`],['Schema version','2']])}<h3 style="font:600 14px Inter,sans-serif;margin:18px 0 6px">Last error</h3><pre class="mono" style="white-space:pre-wrap;background:#f6f5f4;border-radius:12px;padding:10px;margin:0">${d.err}</pre><h3 style="font:600 14px Inter,sans-serif;margin:18px 0 6px">Payload</h3><p style="font-size:13.5px;margin:0">Keys: ${d.k.map(k=>`<span class="mono">${k}</span>`).join(', ')} · ${d.b} bytes. The payload itself is never shown.</p><h3 style="font:600 14px Inter,sans-serif;margin:18px 0 6px">Replays</h3><p style="font-size:13.5px;margin:0">${d.id=='d2'?'28 Oct, 4:02 PM EDT · mina@casevoya.ca · failed again':'None yet.'}</p>`,foot:IFOP(Bt('Retry',{p:1,ic:'refresh',on:`axDrwX();setTimeout(()=>axCf('rt${d.id}'),260)`}))};
  CFS['rt'+d.id]={t:'Retry this event?',body:`Retry this <b class="mono">${d.et}</b> event? It will be sent again to its handler (for example, an email may go out).`,reason:[8,500,'Reason'],ok:'Retry',toast:'Queued for retry'}});
 return H(`Health ${B('b','Unhealthy')}`,'Checked 2:05 PM (EDT). Background work: emails, notifications, webhooks and licence events.',Bt('Refresh',{ic:'refresh',on:"toast2('Refreshed')"}))+
 `<div class="mxG6">${C('hourglass','Pending','12')}${C('loading','Processing','1')}${C('x-circle','Failed (last hour)','0')}${C('alert','Dead-lettered','2',{d:B('b','unhealthy')})}${C('clock','Oldest wait','40 s')}${C('pause','Stuck processing','0')}</div>`+
 P('queue','Dead letters by event type',T(['Event type','Count'],[['<span class="mono">notification.email.send</span>','1'],['<span class="mono">stripe.webhook.invoice_payment_failed</span>','1']]))+
 `<div class="axF"><div class="fld" style="display:block"><label for="fet">Event type</label><select class="sel" id="fet" onchange="location.href='${U({})}&et='+this.value"><option value="">All event types</option>${DLS.map(d=>`<option ${et==d.et?'selected':''}>${d.et}</option>`).join('')}</select></div></div>`+
 P('alert','Dead letters',T(['Event type','Firm','Attempts','Occurred','Last error','Retry'],L.map(d=>[`<span class="mono">${d.et}</span>`,FBY(d.f).n,d.at,d.oc,`<span style="max-width:280px;display:inline-block">${d.err}</span>`,{c:'act',h:IFOP(Bt('Retry',{sm:1,ic:'refresh',on:`axCf('rt${d.id}')`}))||'—'}]),{go:L.map(d=>'drw:'+d.id)}),`${L.length} of 2`)+
 `<p class="axNote">Degraded after 10 min wait, any failure in the last hour or processing over 15 min; unhealthy with any dead letter or over 1 h wait.</p>`};

// ---------- 2.8 Incidents ----------
const INC=[{id:'n1',t:'Scheduled maintenance: database upgrade',k:'Maintenance',sv:'Minor',ph:'Scheduled',s:'2 Nov 2026, 11:00 PM EDT',r:'—',d:'—',a:'All firms',st:'Published'},
 {id:'n2',t:'Email delivery delayed',k:'Incident',sv:'Major',ph:'Ended · not resolved',s:'27 Oct 2026, 8:10 AM EDT',r:'—',d:'2 h 15 min',a:'All firms',st:'Published',stale:1},
 {id:'n3',t:'Upload failures for large PDFs',k:'Incident',sv:'Minor',ph:'Resolved',s:'14 Oct 2026, 2:00 PM EDT',r:'14 Oct, 3:20 PM EDT',d:'1 h 20 min',a:'3 firms',st:'Resolved'}];
const NFORM=`${'<div class="fld"><label>Kind</label><div class="axRadio"><label><input type="radio" name="nK" checked> Incident</label><label><input type="radio" name="nK"> Maintenance</label><label><input type="radio" name="nK"> Notice</label></div></div>'}${FLD('nS','Severity',`<select class="sel" id="nS"><option>Minor</option><option>Major</option><option>Critical</option></select>`)}${FLD('nT','Title',IN('nT','','What firms will see'),'3–120 characters.')}${FLD('nB','Body',TA('nB','',1000),'Up to 1000 characters. No client details.','0 / 1000')}${FLD('nSt','Starts',IN('nSt','2026-10-29T14:30','','datetime-local'))}${FLD('nE','Ends',IN('nE','','','datetime-local'),'Required for maintenance.')}<div class="fld"><label>Audience</label><div class="axRadio"><label><input type="radio" name="nA" checked> All firms</label><label><input type="radio" name="nA"> Listed firms</label></div></div>${CODE()}`;
FMS.notice={rules:[['nT',3,120,'Write a title of 3 to 120 characters.']],confirm:'pub'};
CFS.pub={t:'Publish to all firms?',body:"Every firm's staff will see this notice in Casevoya from 29 Oct 2026, 2:30 PM EDT.",ok:'Publish',toast:'Notice published',code:false};
CFS.res={t:'Resolve this incident?',body:'Firms will see it as resolved. You can add a closing note.',reason:[3,500,'Closing note'],ok:'Resolve',toast:'Incident resolved'};
PGS.incidents=()=>{const tab=SUB||'log';
 DRS.post={t:'Post a notice',body:NFORM,foot:Bt('Cancel',{on:'axDrwX()'})+Bt('Save as draft',{on:"axDrwX();toast2('Draft saved')"})+Bt('Publish',{p:1,on:"axForm('notice')"})};
 INC.forEach(n=>DRS[n.id]={t:n.t,body:`<div style="display:flex;gap:6px;margin:0 0 12px">${B(n.k=='Incident'?'w':'n',n.k)}${B('g',n.sv)}${B(n.ph=='Resolved'?'':'w',n.ph)}</div>${DL([['Starts',n.s],['Resolved',n.r],['Duration',n.d],['Audience',n.a],['Status',n.st]])}<p style="font-size:14px;margin:14px 0 0">Firms see: “${n.t}. We'll update this notice as we learn more.”</p>`,foot:IFOP(Bt('Edit',{on:"axDrwX();setTimeout(()=>axDrw('post'),260)"})+(n.ph=='Resolved'?'':Bt('Resolve',{p:1,on:"axDrwX();setTimeout(()=>axCf('res'),260)"})))});
 return H(`Incidents ${B('','Operational')}`,`Queues: <b style="color:#b42318">Unhealthy</b> (2 dead letters). What firms see in Casevoya's status banner.`,IFOP(Bt('Post a notice',{p:1,ic:'plus',on:"axDrw('post')"})))+
 (CAN.operate?`<div class="axSum" style="background:#fffaf0;border-color:#f3d39a;color:#7a4500"><b>“Email delivery delayed” ended but isn't resolved</b>Firms still see it as ongoing. <a href="#" style="color:#a35b00" onclick="event.preventDefault();axCf('res')">Resolve it</a></div>`:'')+
 TABS([['log','Incident log'],['notices','Notices']],tab)+
 (tab=='notices'?P('bell','Notices',T(['Title','Kind','Status','Starts','Audience'],INC.map(n=>[n.t,n.k,B(n.st=='Resolved'?'':'n',n.st),n.s,n.a]),{go:INC.map(n=>'drw:'+n.id)}))
 :`<div class="axF">${SEL('iS','State',['All','Active','Scheduled','Resolved'])}${SEL('iK','Kind',['All','Incident','Maintenance','Notice'])}</div>`+P('incident','Incident log',T(['Title','Kind','Severity','Phase','Started','Resolved','Duration','Audience'],INC.map(n=>[n.t,n.k,n.sv,B(n.ph=='Resolved'?'':n.ph=='Scheduled'?'n':'w',n.ph),n.s,n.r,n.d,n.a]),{go:INC.map(n=>'drw:'+n.id)})))};
// ---------- 2.9 Releases ----------
const RL=[['Retainer agreement','v3','Published','1 Oct 2026','30 Sep 2026','kenji@casevoya.ca','mina@casevoya.ca','5','Fee schedule wording for 2026 IRCC fees'],
 ['Use of representative (IMM 5476) cover letter','v2','Published','15 Sep 2026','14 Sep 2026','kenji@casevoya.ca','jordan@casevoya.ca','6','New signature block'],
 ['Client intake checklist','v5','Rolled back','—','2 Sep 2026','kenji@casevoya.ca','mina@casevoya.ca','0','Withdrawn: wrong document list for spousal'],
 ['Client intake checklist','v4','Published','12 Aug 2026','11 Aug 2026','kenji@casevoya.ca','mina@casevoya.ca','6','Adds proof of funds items'],
 ['Retainer agreement','v2','Superseded','1 Jun 2026','30 May 2026','kenji@casevoya.ca','jordan@casevoya.ca','—','Initial CICC Code wording']];
CFS.ap={t:'Approve Retainer agreement v4?',body:'It becomes the published version on its effective date. Firms adopting the template get it then.',chk:'I compared this draft with the published version and its sources',ok:'Approve',toast:'Version approved'};
CFS.rj={t:'Reject this draft?',body:'The author sees your reason and can make a new draft.',reason:[3,500,'Reason'],ok:'Reject',danger:1,toast:'Draft rejected'};
CFS.rb={t:'Roll back?',body:'Withdraw v3 and restore v2 for 5 firms?',reason:[3,500,'Reason'],ok:'Roll back',danger:1,toast:'Rolled back to v2'};
PGS.releases=()=>{if(RID)return VER();const tab=SUB||'releases';
 DRS.draft={t:'New draft',body:`${FLD('dT','Template',`<select class="sel" id="dT"><option>Retainer agreement</option><option>Client intake checklist</option><option>Use of representative cover letter</option></select>`)}${FLD('dC','Changelog',TA('dC','What changed and why',500),'3–500 characters.','0 / 500')}${FLD('dS','Official sources',TA('dS','One URL per line (canada.ca, college-ic.ca, laws-lois.justice.gc.ca)',2000),'At least one official source is needed before anyone can approve.')}${FLD('dE','Effective on',IN('dE','2026-11-15','','date'))}`,foot:Bt('Cancel',{on:'axDrwX()'})+Bt('Save draft',{p:1,on:"axForm('draft')"})};
 FMS.draft={rules:[['dC',3,500,'Write a changelog of 3 to 500 characters.']],toast:'Draft saved',sub:'A reviewer who is not you must approve it.'};
 return H('Releases','Shared template versions firms adopt. Every version is reviewed by a second admin before it publishes.',IFOP(Bt('New draft',{p:1,ic:'plus',on:"axDrw('draft')"})))+
 TABS([['releases','Template releases'],['templates','Templates'],['app','App release notes']],tab)+
 (tab=='app'?STUB('App release notes','Casevoya app release notes are not published from the portal yet. Engineering posts them in the changelog repository.')
 :tab=='templates'?P('templates','Templates',T(['Template','Published','Draft','Status',''],[['Retainer agreement','v3','v4',B('w','Awaiting review'),{c:'act',h:IFOP(Bt('Review',{sm:1,href:U({id:'v4'})}))}],['Client intake checklist','v4','—',B('','Published'),''],['Use of representative cover letter','v2','—',B('','Published'),'']]))+P('globe','Official sources',`<div class="axPad" style="font-size:14px">Allowed domains: <span class="mono">canada.ca</span>, <span class="mono">college-ic.ca</span>, <span class="mono">laws-lois.justice.gc.ca</span>, <span class="mono">irb-cisr.gc.ca</span>. Changes to this list happen in the database, not here.</div>`)
 :`<div class="axF">${SEL('rT','Template',['All templates','Retainer agreement','Client intake checklist'])}${SEL('rS','Status',['All','Published','Superseded','Rolled back'])}</div>`+P('templates','Template releases',T(['Template','Version','Status','Effective on','Published','Reviewer','Author','Adopting firms','Changelog'],RL.map(r=>[r[0],r[1],B(r[2]=='Published'?'':r[2]=='Rolled back'?'b':'g',r[2]),r[3],r[4],r[5],r[6],r[7],`<span style="max-width:220px;display:inline-block">${r[8]}</span>`]),{go:RL.map(()=>U({id:'v4'}))})))};
const VER=()=>H('Retainer agreement · v4',`Draft by mina@casevoya.ca · effective 15 Nov 2026 · ${B('w','Awaiting review')}`,CAN.review?Bt('Reject',{on:"axCf('rj')"})+Bt('Roll back v3',{on:"axCf('rb')"})+Bt('Approve',{p:1,ic:'check-circle',on:"axCf('ap')"}):'',`<a href="${U({id:''})}">Releases</a>›<span>v4</span>`)+
 P('merge','Changes from v3',`<div class="axPad"><div class="axDiff"><div><h4>Published v3</h4><ul><li>Fees: <span class="rem">CA$1,085 permanent residence fee</span></li><li>Refund within 30 days of written notice.</li><li>Complaints to the College under s. 41 of the Code.</li></ul></div><div><h4>Draft v4</h4><ul><li>Fees: <span class="add">CA$1,525 right of permanent residence fee (2026)</span></li><li>Refund within 30 days of written notice.</li><li>Complaints to the College under s. 41 of the Code.</li><li><span class="add">New: consent to electronic signatures.</span></li></ul></div></div></div>`)+
 `<div class="mxG2">${P('globe','Sources',`<ul class="axGL"><li><span class="ki">${I('link')}</span><span>canada.ca · Fees for immigration applications<small>Retrieved 20 Oct 2026</small></span></li><li><span class="ki">${I('link')}</span><span>college-ic.ca · Code of Professional Conduct<small>Retrieved 20 Oct 2026</small></span></li></ul>`)}${P('file-check','Test evidence',`<div class="axPad" style="font-size:14px">Rendered for 3 sample matters · no missing fields · PDF output checked.</div>`)}</div>`+
 `<div class="mxG2">${P('note','Changelog',`<div class="axPad" style="font-size:14px">Fee schedule updated for 2026 IRCC fees; adds electronic signature consent.</div>`)}${P('users','Reviews',`<div class="axPad" style="font-size:14px">No reviews yet. The author can't approve their own draft. Approve is disabled when a version has no official source.</div>`)}</div>`;

// ---------- 2.11 Config ----------
const SET=[['trial.duration','Length of a new firm\u2019s free trial','14 days',0,'2 Sep 2026','3'],['licence.recheck_interval','How often a current licence is checked again','90 days',0,'12 Aug 2026','2'],['licence.manual_check_target','Target to finish a manual check','2 business_days',1,'—','1'],['source.recheck_interval.canada.ca','How often canada.ca sources are re-read','30 days',0,'1 Jul 2026','1']];
PGS.config=()=>{const tab=SUB||'settings';if(tab=='admins')return CFGH(tab)+(CAN.manage?ADMINS():DENY('Only owners can manage admins.'));
 return CFGH(tab)+(tab=='switches'?`<div class="axStale" style="color:#3d3a36;margin:0 0 12px">${I('info')}Switches cannot be changed from the portal yet.</div>`+P('toggle','Switches',T(['Switch','Description','State'],[['signup.open','New firms can sign up',B('','On')],['ai.enabled','AI drafting is offered to firms',B('','On')],['payments.live','Stripe live mode',B('','On')]])):
 tab=='flags'?STUB('Feature flags','Per-firm feature flags and kill switches are not built. Today a release is controlled in the deploy pipeline, not here.'):
 (SET.forEach(([k,d,v])=>{const [n,u]=v.split(' ');DRS['s_'+k]={t:'Change '+k,body:`<p style="margin:0 0 12px;font-size:14px">${d}. Current value: <b>${v}</b>.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${FLD('sN','Count',IN('sN',n,'','number'),'1–3650.')}${FLD('sU','Unit',`<select class="sel" id="sU"><option ${u=='days'?'selected':''}>days</option><option ${u=='business_days'?'selected':''}>business_days</option><option>weeks</option><option>months</option></select>`)}</div>${FLD('sR','Reason',TA('sR','Why this changes',500),'3–500 characters. Saved to the audit log.','0 / 500')}<div class="axCode" style="background:#f6f5f4;border-color:#ebe8e4"><p style="margin:0"><b>Preview:</b> ${k=='trial.duration'?'Trial length':k}: ${v.replace('_',' ')} → 21 days. Applies to new firms only.</p></div>${CODE()}`,foot:Bt('Cancel',{on:'axDrwX()'})+Bt('Save change',{p:1,on:"axForm('set')"})}}),
 P('settings','Settings',T(['Key','Description','Value','Updated','Version',''],SET.map(([k,d,v,un,up,ver])=>[`<span class="mono">${k}</span>`,d,v+(un?' '+B('w','Unconfirmed'):''),up,ver,{c:'act',h:IFOWN(Bt('Change',{sm:1,on:`axDrw('s_${k}')`}))}])))));};
FMS.set={rules:[['sN',1,3650,'Count must be 1 to 3650.'],['sR',3,500,'Write a reason of 3 to 500 characters.']],code:1,toast:'Setting changed',sub:'Trial length: 14 days → 21 days'};
const CFGH=tab=>H('Config','Product settings and who can administer the platform.')+TABS([['settings','Settings'],['switches','Switches'],['flags','Feature flags'],...(CAN.manage?[['admins','Admins']]:[])],tab);

// ---------- Config › Admins (owners only) ----------
const ADM=[['jordan@casevoya.ca','owner',0,0,'Password + app','29 Oct, 1:50 PM EDT','script · 2 Jan 2026'],['kenji@casevoya.ca','operator',1,1,'Password + app','29 Oct, 11:02 AM EDT','jordan@ · 9 Feb 2026'],['mina@casevoya.ca','operator',1,0,'Password + app','28 Oct, 4:00 PM EDT','jordan@ · 9 Feb 2026'],['ava@casevoya.ca','viewer',0,0,'Password + app','21 Oct, 9:30 AM EDT','kenji@ · 3 Sep 2026']];
const ADMINS=()=>{ADM.forEach(a=>CFS['rm'+a[0]]={t:'Remove this admin?',body:`${a[0]} loses platform access at once. Their audit history stays.`,typed:a[0],reason:[3,500,'Reason'],ok:'Remove admin',danger:1,toast:'Admin removed'});
 DRS.inv={t:'Invite an admin',body:`${FLD('iE','Email',IN('iE','','name@company.com','email'),'They must sign in to Cloudflare Access with this exact email.')}${FLD('iR','Role',`<select class="sel" id="iR"><option>operator</option><option>viewer</option><option>owner</option></select>`)}<label class="axChk"><input type="checkbox"> Template reviewer</label>${FLD('iN','Note',TA('iN','For your records',200),'Up to 200 characters.','0 / 200')}${FLD('iD','Expires in (days)',IN('iD','7','','number'),'1–30 days.')}${CODE()}`,foot:Bt('Cancel',{on:'axDrwX()'})+Bt('Create invite',{p:1,on:"axForm('inv')"})};
 FMS.inv={rules:[['iE',5,254,'Enter the invitee\u2019s email.'],['iD',1,30,'Expiry must be 1 to 30 days.']],code:1,toast:'Invite created',sub:'No email was sent. See the next steps.',after:()=>setTimeout(()=>axDrw('next'),300)};
 DRS.next={t:'Invite created',body:`<p style="font-size:14px;margin:0 0 10px">No email is sent. Tell the person yourself, then:</p><ol class="axSteps"><li>Add their email to the Cloudflare Access policy for the admin portal.</li><li>Send them the portal link. They sign in with Access, then accept the invite here.</li><li>They set up a password and an authenticator app on first sign-in.</li></ol>${DL([['accessReady',B('w','false')+'<small>Their email is not in the Access policy yet.</small>'],['Expires','5 Nov 2026, 2:05 PM EDT']])}`,foot:Bt('Done',{p:1,on:'axDrwX()'})};
 const own=ADM.filter(a=>a[1]=='owner').length;
 return P('users','Admins',T(['Email','Role','Template reviewer','Licensed','Factors','Last sign-in','Added by / at',''],ADM.map(a=>{const last=a[1]=='owner'&&own==1;return [a[0],last?`<span title="The last owner can't be demoted">${B('n','owner')}</span><small>Last owner</small>`:`<select class="sel" aria-label="Role for ${a[0]}" style="min-width:110px" onchange="toast2('Role changed',{kind:'ok',sub:'${a[0]} is now '+this.value})">${['owner','operator','viewer'].map(r=>`<option ${r==a[1]?'selected':''}>${r}</option>`).join('')}</select>`,`<button class="axSw" role="switch" aria-checked="${!!a[2]}" aria-label="Template reviewer for ${a[0]}" onclick="this.setAttribute('aria-checked',this.getAttribute('aria-checked')!='true');toast2('Reviewer updated')"></button>`,a[3]?B('','Licensed'):'—',a[4],a[5],a[6],{c:'act',h:last?'<small>Can\u2019t remove the last owner</small>':Bt('Remove',{sm:1,on:`axCf('rm${a[0]}')`})}]})),`4 admins · every change asks for your code`)+
 P('mail','Invites',T(['Email','Role','Status','Expires','Created by',''],[['daniel@casevoya.ca','operator',B('w','pending'),'4 Nov 2026','jordan@',{c:'act',h:Bt('Cancel',{sm:1,on:"axCf('ci')"})}],['priya.s@casevoya.ca','viewer',B('g','expired'),'20 Oct 2026','kenji@',''],['ava@casevoya.ca','viewer',B('','accepted'),'—','kenji@',''],['tom@casevoya.ca','operator',B('g','cancelled'),'—','jordan@','']]),IFOWN(Bt('Invite an admin',{sm:1,p:1,ic:'user-plus',on:"axDrw('inv')"})))+
 P('history','Removed',T(['Email','Role','Removed','By','Reason'],[['leo@casevoya.ca','operator','12 Oct 2026','jordan@casevoya.ca','Left Casevoya']]))};
CFS.ci={t:'Cancel this invite?',body:'daniel@casevoya.ca can no longer accept it.',ok:'Cancel invite',danger:1,toast:'Invite cancelled'};

// ---------- 2.9 Audit ----------
const AU=[['29 Oct, 1:58 PM EDT','admin_portal.health.replay','success','mina@casevoya.ca','Northline Immigration','outbox · 7c1e','req_8f2c41'],['29 Oct, 1:31 PM EDT','support_access.approved','success','owner','Northline Immigration','support_access · 2b90','req_31aa0e'],['29 Oct, 11:02 AM EDT','licence.checked','success','kenji@casevoya.ca','Northline Immigration','consultant_credentials · 9d12','req_77b1c3'],['28 Oct, 4:20 PM EDT','admin_portal.config.change','denied','ava@casevoya.ca','—','product_settings · trial','req_5e0d92'],['28 Oct, 9:15 AM EDT','subscription.payment_failed','failure','system','Lakeside Visa Services','organization_subscriptions · 41f0','req_0c6b18']];
PGS.audit=()=>H('Audit log','Platform actions only: support access, notices, licence checks, templates, retries, admins and settings. Firm content never appears here.',Bt('Refresh',{ic:'refresh',on:"toast2('Refreshed')"}))+
 FILT('Object id',SEL('aA','Action',['All families','admin_portal.','platform_admin.','support_access.','service_notice.','template.','outbox.','licence.','cicc.','subscription.','security.'])+SEL('aF','Firm',['All firms',...FIRMS.map(f=>f.n)])+SEL('aU','Actor',['Anyone',...ADM.map(a=>a[0])])+SEL('aR','Result',['All','success','denied','failure'])+`<div class="fld"><label for="aFr">From</label>${IN('aFr','2026-10-22T00:00','','datetime-local')}</div><div class="fld"><label for="aTo">To</label>${IN('aTo','','','datetime-local')}</div>`)+
 P('history','Events',T(['Time','Action','Result','Actor','Firm','Object','Request id'],AU.map(a=>[a[0],`<span class="mono">${a[1]}</span>`,B(a[2]=='success'?'':a[2]=='denied'?'w':'b',a[2]),a[3],a[4],`<span class="mono">${a[5]}</span>`,`<span class="mono">${a[6]}</span>`]),{go:AU.map((a,i)=>'drw:au'+i)})+`<div class="axPg"><span>5 events · newest first</span><span class="r">${Bt('Load more',{sm:1,on:"toast2('Loaded 5 more')"})}</span></div>`)+
 '<p class="axNote">Export is not available yet.</p>'+(AU.forEach((a,i)=>DRS['au'+i]={t:a[1],body:DL([['Time',a[0]],['Result',a[2]],['Actor',a[3]],['Firm',a[4]],['Object',a[5]],['Request id',a[6]]])+`<h3 style="font:600 14px Inter,sans-serif;margin:18px 0 6px">Context</h3><pre class="mono" style="background:#f6f5f4;border-radius:12px;padding:10px;white-space:pre-wrap;margin:0">${a[1].startsWith('subscription')?'null (diff_keys: status, current_period_end)':'{ "reason": "Recipient fixed by firm", "event_type": "notification.email.send" }'}</pre>`}),'');

// ---------- 2.10 Privacy ----------
PGS.privacy=()=>{const tab=SUB||'requests',seg=Q.get('seg')||'open';
 return H('Privacy','Privacy requests firms are handling, with legal due dates. Read-only: firms answer requests themselves.')+TABS([['requests','Requests'],['breach','Breach register']],tab)+
 (tab=='breach'?STUB('Breach register','Recording privacy breaches and reports to the OPC is not built. Keep them in the incident runbook until it is.'):
 `<div class="mxG4">${C('inbox','Open','3')}${C('alarm','Overdue','1',{d:B('b','past 30 days')})}${C('clock','Due in 5 days','1')}${C('check-circle','Closed (30 d)','4')}</div><div class="axChips"><span class="c">Access 2</span><span class="c">Correction 1</span><span class="c">Deletion 0</span></div>`+
 SEG([['open','Open',3],['overdue','Overdue',1],['closed','Closed',4],['all','All',7]],seg)+
 P('privacy','Requests',T(['Firm','Reference','Kind','Channel','Received','Due','Days left','Stage','Assigned','Outcome'],[[FN(FBY('f3')),'PR-0031','Access','Email','24 Sep 2026','24 Oct 2026',B('b','5 overdue'),STEP(2),'Firm owner','—'],[FN(FBY('f1')),'PR-0040','Correction','Portal','6 Oct 2026','5 Nov 2026',B('w','7'),STEP(3),'Firm staff','—'],[FN(FBY('f2')),'PR-0044','Access','Letter','20 Oct 2026','19 Nov 2026','21',STEP(1),'—','—']])))};
const STEP=n=>`<span class="axStep" aria-label="Stage ${n} of 4">${[1,2,3,4].map(i=>`<i class="${i<=n?'on':''}"></i>`).join('')}<small>${['Received','Verifying','Gathering','Answered'][n-1]}</small></span>`;

// ---------- Sample mode ----------
PGS.sample=()=>H('Sample mode','Firms trying Casevoya with sample data, and how far through the proof steps they are. No actions.')+
 `<div class="mxG3">${C('grid','Firms in sample mode','1')}${C('check-circle','Proof complete','0')}${C('alert','Mixed (sample + real data)','0')}</div>`+
 P('grid','Firms',T(['Firm','Started','Proof steps','Done'],[[FN(FBY('f5')),'24 Oct 2026',`<span class="axDots" aria-label="3 of 6: intake, agreement, upload done">${['intake','agreement','upload','reminder','invoice','export'].map((s,i)=>`<i class="${i<3?'on':''}" title="${s}"></i>`).join('')}</span><small>intake · agreement · upload · reminder · invoice · export</small>`,'3 of 6']]));

// ---------- Migration ----------
PGS.migration=()=>H('Migration','Imports firms run from other systems. Row content is never shown. No actions.')+
 `<div class="mxG3">${C('import','Active','2')}${C('alert','Stuck','1',{d:B('b','committing > 30 min')})}${C('trash','Purge due','1')}</div><div class="axChips"><span class="c">staged 1</span><span class="c">checked 1</span><span class="c b">stuck 1</span><span class="c">committed 3</span><span class="c">discarded 0</span></div>`+
 `<div class="axF">${SEL('mS2','Status',['All','staged','checked','committing','committed','discarded','stuck'])}${SEL('mF','Firm',['All firms',...FIRMS.map(f=>f.n)])}</div>`+
 P('import','Import jobs',T(['Firm','Kind','Source system','Status','Size','Rows','Attachments','Exceptions','Pilot','Commit','Purge after','Updated','Sample'],[[FN(FBY('f2')),'Matters','Officio',B('b','Stuck'),'48 MB','1,204 / 1,204','312 files','6','Passed','Started 1:12 PM EDT','28 Nov 2026','1:14 PM EDT','No'],[FN(FBY('f1')),'Clients','CSV',B('n','checked'),'2 MB','388 / 390','—','2','—','—','28 Nov 2026','28 Oct','No'],[FN(FBY('f5')),'Clients','CSV',B('','committed'),'0.1 MB','25 / 25','—','0','Passed','24 Oct','23 Nov 2026','24 Oct',B('n','Sample')]],{go:['drw:mj','drw:mj','drw:mj']}));
DRS.mj={t:'Import job · Harbourview Legal',body:DL([['Status',B('b','Stuck')],['Kind','Matters'],['Rows staged','1,204'],['Plan count','1,204'],['Attachments','312 files · 41 MB'],['Commit started','29 Oct, 1:12 PM EDT'],['Purge after','28 Nov 2026']])+'<p class="axNote">Stuck: committing for more than 30 minutes. Contact the firm; there are no actions here.</p>'};
// ---------- shared states ----------
const DENY=(why='')=>`<div class="axP"><div class="axPad" style="text-align:center;padding:44px 20px">${I('lock')}<h2 style="font:500 24px Erode,Georgia,serif;margin:10px 0 6px">You don't have access to this page</h2><p style="color:#5d5954;margin:0 0 4px">Your role: <b>${ROLE}</b>. ${why||'Ask an owner if you need it.'}</p></div></div>`;
const EMPTY={overview:'No firms yet. Firms appear here after an owner signs up.',firms:'No firms yet.',subscriptions:"No subscription exceptions. Every firm's billing is in order.",usage:'No firms yet.',verification:'No licences waiting for a check.',grants:SUB=='active'?'No one has support access right now.':'No requests waiting for a firm.',health:'No dead letters. Every event was delivered or is still being tried.',incidents:'No incidents recorded. Post a notice when something affects firms.',releases:'No template releases yet.',config:'No settings found.',audit:'No audit events match.',privacy:'No privacy requests are open.',sample:'No firm is using sample data.',migration:Q.get('seg')=='stuck'?'No stuck imports.':'No import jobs.'};
const GOOD=['subscriptions','health'];
const EMP=(t,ok)=>`<div class="axP"><div class="axPad" style="text-align:center;padding:48px 20px"><span style="display:inline-grid;place-items:center;width:52px;height:52px;border-radius:16px;background:${ok?'#e8f5ec':'#f0eeeb'};color:${ok?'#1d7a3e':'#6b6762'}">${I(ok?'check-circle':'inbox')}</span><p style="font-size:15px;margin:12px 0 0;color:${ok?'#145c2e':'#3d3a36'}">${t}</p></div></div>`;
const SKEL=()=>`<div class="mxG5">${'<div class="mxSk" style="height:120px"></div>'.repeat(5)}</div><div class="mxSk" style="height:46px;margin:0 0 8px"></div>${'<div class="mxSk" style="height:48px;margin:0 0 6px"></div>'.repeat(6)}`;
const head=()=>H(NM[TB]||'Operations','');
const VFORM={grants:['req','grant'],incidents:['post','notice'],config:['s_trial.duration','set'],releases:['draft','draft'],verification:null};
function body(){
 if(ROLE=='viewer'&&ST=='denied')return head()+DENY('Viewers can read most pages but not this one.');
 if(ST=='denied')return head()+DENY();
 if(ST=='loading')return head()+SKEL();
 if(ST=='slow')return head()+`<div class="axSlow">${I('loading')}Still loading…${Bt('Retry',{sm:1,on:'location.reload()'})}</div>`+SKEL();
 if(ST=='empty')return head()+EMP(EMPTY[TB]||'Nothing here yet.',GOOD.includes(TB));
 if(ST=='filtered')return head()+FILT('Search',SEL('x1','Status',['Past due']),1)+EMP('Nothing matches these filters.')+`<div style="text-align:center;margin-top:-6px">${Bt('Clear filters',{on:`location.href='${U({state:''})}'`})}</div>`;
 if(ST=='notfound')return head()+EMP("We couldn't find that record. It may have been removed, or the link is wrong.")+`<div style="text-align:center">${Bt('Back to '+NM[TB],{href:U({id:''})})}</div>`;
 let h=(PGS[TB]||PGS.overview)();
 if(ST=='error')h=`<div class="axSum" role="alert"><b>Couldn't refresh ${NM[TB]}</b>The portal couldn't reach the database. Showing data from 1:58 PM (EDT), marked stale. Request id <span class="mono">req_8f2c41</span>. <a href="#" onclick="event.preventDefault();location.reload()">Try again</a></div>`+h;
 if(ST=='stale')h=`<div class="axStale" style="margin:0 0 12px">${I('clock')}Last updated 1:58 PM (EDT). We'll keep trying; figures may be out of date.</div>`+h;
 if(ST=='offline')h=`<div class="axSum" role="status" style="background:#f6f5f4;border-color:#e3e0dc;color:#3d3a36"><b>${I('wifi-off')} You're offline</b>Showing what was loaded at 2:05 PM (EDT). Actions come back when you reconnect.</div>`+h;
 if(ST=='conflict')h=`<div class="axSum" role="alert"><b>This changed since you opened it</b>Someone else saved a newer version. <a href="#" onclick="event.preventDefault();location.reload()">Reload to see the latest</a></div>`+h;
 return h}
// ---------- session screens (spec §3) ----------
const FULL=inner=>`<div class="axFull"><div class="card"><div class="axLogo"><img src="../../assets/brand/vo-mark-white.svg" alt="">Casevoya admin</div>${inner}</div></div>`;
const SCREENS={
 noaccess:()=>FULL(`<h1>You don't have access to the admin portal</h1><p>You're signed in to Cloudflare Access as <b>sam.lee@casevoya.ca</b>, but that email isn't a platform admin.</p><p>Ask an owner to invite you. Owners add admins in Config › Admins.</p><a class="btn" href="/cdn-cgi/access/logout" style="width:100%;justify-content:center;height:44px;border-radius:14px">${I('logout')}Sign out of Access</a>`),
 gateerror:()=>FULL(`<h1>The portal can't check your access right now</h1><p>This is on our side. Try again in a minute. If it keeps happening, share this request id with engineering: <span class="mono">req_5e0d92</span>.</p><button class="btn p" style="width:100%" onclick="location.reload()">${I('refresh')}Try again</button><p style="margin:12px 0 0;text-align:center"><a href="/cdn-cgi/access/logout" style="color:#0075DE;font-size:14px">Sign out of Access</a></p>`),
 invite:()=>FULL(`<h1>You've been invited</h1><p>You've been invited as <b>operator</b> (template reviewer: yes). Expires 4 Nov 2026, 2:05 PM EDT.</p><ol class="axSteps"><li class="${SESS!='none'?'done':''}"><span><b>Sign in</b><br><small style="color:#6b6762">Password and authenticator app for daniel@casevoya.ca</small></span></li><li><span><b>Accept the role</b></span></li></ol>${SESS=='none'?`<button class="btn p" style="width:100%" onclick="axSignIn()">Sign in</button>`:`<label class="axChk" id="w-acc"><input type="checkbox" id="acc"> I accept the platform admin role</label><button class="btn p" style="width:100%" onclick="if(!$('#acc').checked){ERR('acc','Tick the box to accept.');return}toast2('Welcome to Casevoya admin',{kind:'ok'});setTimeout(()=>location.href='admin.html',900)">Accept invite</button>`}`),
 unauth:()=>FULL(`<h1>Access sign-in ended</h1><p>Your Cloudflare Access session expired. Reload to sign in again; nothing you saved is lost.</p><button class="btn p" style="width:100%" onclick="location.reload()">${I('refresh')}Reload</button>`)};
// ---------- render ----------
document.title=(NM[TB]||'Operations')+' · Casevoya admin';
$('#content').innerHTML=(SESS=='mismatch'?`<div class="axSum" role="alert" style="background:#fffaf0;border-color:#f3d39a;color:#7a4500"><b>Session mismatch</b>Your admin session belongs to a different Access sign-in. Sign out and sign in again. <a href="#" style="color:#a35b00" onclick="event.preventDefault();axSignIn()">Sign in again</a></div>`:'')+BANNER+body();
if(OFF)document.body.classList.add('axOffline');
if(ROLE=='viewer')document.body.classList.add('axViewer');
if(SCREENS[SCR]){document.body.insertAdjacentHTML('beforeend',SCREENS[SCR]());document.body.style.overflow='hidden'}
setTimeout(()=>{if(SCR=='signin')axSignIn();if(SCR=='stepup')axStepUp();const d=Q.get('dlg'),r=Q.get('drw');if(d&&CFS[d])axCf(d);if(r&&DRS[r])axDrw(r);
 if(ST=='validation'){const v=VFORM[TB];if(v){axDrw(v[0]);setTimeout(()=>axForm(v[1]),350)}else if(d)setTimeout(()=>axCfOk(d),200)}
 if(ST=='success')toast2('Saved',{kind:'ok',sub:'Your change is recorded in the audit log.'})},250);
window.CICC=CICC;window.ERR=ERR;})();
