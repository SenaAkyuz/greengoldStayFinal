(function(){var e,t,n,r,i,a,o,s,c,l,u,d,f,p,m={},h=[],g=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,_=Array.isArray;function v(e,t){for(var n in t)e[n]=t[n];return e}function y(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function b(t,n,r){var i,a,o,s={};for(o in n)o==`key`?i=n[o]:o==`ref`?a=n[o]:s[o]=n[o];if(arguments.length>2&&(s.children=arguments.length>3?e.call(arguments,2):r),typeof t==`function`&&t.defaultProps!=null)for(o in t.defaultProps)s[o]===void 0&&(s[o]=t.defaultProps[o]);return x(t,s,i,a,null)}function x(e,r,i,a,o){var s={type:e,props:r,key:i,ref:a,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++n,__i:-1,__u:0};return o==null&&t.vnode!=null&&t.vnode(s),s}function S(e){return e.children}function C(e,t){this.props=e,this.context=t}function w(e,t){if(t==null)return e.__?w(e.__,e.__i+1):null;for(var n;t<e.__k.length;t++)if((n=e.__k[t])!=null&&n.__e!=null)return n.__e;return typeof e.type==`function`?w(e):null}function T(e){if(e.__P&&e.__d){var n=e.__v,r=n.__e,i=[],a=[],o=v({},n);o.__v=n.__v+1,t.vnode&&t.vnode(o),F(e.__P,o,n,e.__n,e.__P.namespaceURI,32&n.__u?[r]:null,i,r??w(n),!!(32&n.__u),a),o.__v=n.__v,o.__.__k[o.__i]=o,ne(i,o,a),n.__e=n.__=null,o.__e!=r&&E(o)}}function E(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),E(e)}function D(e){(!e.__d&&(e.__d=!0)&&r.push(e)&&!O.__r++||i!=t.debounceRendering)&&((i=t.debounceRendering)||a)(O)}function O(){try{for(var e,t=1;r.length;)r.length>t&&r.sort(o),e=r.shift(),t=r.length,T(e)}finally{r.length=O.__r=0}}function ee(e,t,n,r,i,a,o,s,c,l,u){var d,f,p,g,_,v,y,b=r&&r.__k||h,x=t.length;for(c=k(n,t,b,c,x),d=0;d<x;d++)(p=n.__k[d])!=null&&(f=p.__i!=-1&&b[p.__i]||m,p.__i=d,v=F(e,p,f,i,a,o,s,c,l,u),g=p.__e,p.ref&&f.ref!=p.ref&&(f.ref&&I(f.ref,null,p),u.push(p.ref,p.__c||g,p)),_==null&&g!=null&&(_=g),(y=!!(4&p.__u))||f.__k===p.__k?(c=A(p,c,e,y),y&&f.__e&&(f.__e=null)):typeof p.type==`function`&&v!==void 0?c=v:g&&(c=g.nextSibling),p.__u&=-7);return n.__e=_,c}function k(e,t,n,r,i){var a,o,s,c,l,u=n.length,d=u,f=0;for(e.__k=Array(i),a=0;a<i;a++)(o=t[a])!=null&&typeof o!=`boolean`&&typeof o!=`function`?(typeof o==`string`||typeof o==`number`||typeof o==`bigint`||o.constructor==String?o=e.__k[a]=x(null,o,null,null,null):_(o)?o=e.__k[a]=x(S,{children:o},null,null,null):o.constructor===void 0&&o.__b>0?o=e.__k[a]=x(o.type,o.props,o.key,o.ref?o.ref:null,o.__v):e.__k[a]=o,c=a+f,o.__=e,o.__b=e.__b+1,s=null,(l=o.__i=j(o,n,c,d))!=-1&&(d--,(s=n[l])&&(s.__u|=2)),s==null||s.__v==null?(l==-1&&(i>u?f--:i<u&&f++),typeof o.type!=`function`&&(o.__u|=4)):l!=c&&(l==c-1?f--:l==c+1?f++:(l>c?f--:f++,o.__u|=4))):e.__k[a]=null;if(d)for(a=0;a<u;a++)(s=n[a])!=null&&!(2&s.__u)&&(s.__e==r&&(r=w(s)),ae(s,s));return r}function A(e,t,n,r){var i,a;if(typeof e.type==`function`){for(i=e.__k,a=0;i&&a<i.length;a++)i[a]&&(i[a].__=e,t=A(i[a],t,n,r));return t}e.__e!=t&&(r&&(t&&e.type&&!t.parentNode&&(t=w(e)),n.insertBefore(e.__e,t||null)),t=e.__e);do t&&=t.nextSibling;while(t!=null&&t.nodeType==8);return t}function j(e,t,n,r){var i,a,o,s=e.key,c=e.type,l=t[n],u=l!=null&&(2&l.__u)==0;if(l===null&&s==null||u&&s==l.key&&c==l.type)return n;if(r>+!!u){for(i=n-1,a=n+1;i>=0||a<t.length;)if((l=t[o=i>=0?i--:a++])!=null&&!(2&l.__u)&&s==l.key&&c==l.type)return o}return-1}function M(e,t,n){t[0]==`-`?e.setProperty(t,n??``):e[t]=n==null?``:typeof n!=`number`||g.test(t)?n:n+`px`}function N(e,t,n,r,i){var a,o;n:if(t==`style`)if(typeof n==`string`)e.style.cssText=n;else{if(typeof r==`string`&&(e.style.cssText=r=``),r)for(t in r)n&&t in n||M(e.style,t,``);if(n)for(t in n)r&&n[t]==r[t]||M(e.style,t,n[t])}else if(t[0]==`o`&&t[1]==`n`)a=t!=(t=t.replace(u,`$1`)),o=t.toLowerCase(),t=o in e||t==`onFocusOut`||t==`onFocusIn`?o.slice(2):t.slice(2),e.l||={},e.l[t+a]=n,n?r?n[l]=r[l]:(n[l]=d,e.addEventListener(t,a?p:f,a)):e.removeEventListener(t,a?p:f,a);else{if(i==`http://www.w3.org/2000/svg`)t=t.replace(/xlink(H|:h)/,`h`).replace(/sName$/,`s`);else if(t!=`width`&&t!=`height`&&t!=`href`&&t!=`list`&&t!=`form`&&t!=`tabIndex`&&t!=`download`&&t!=`rowSpan`&&t!=`colSpan`&&t!=`role`&&t!=`popover`&&t in e)try{e[t]=n??``;break n}catch{}typeof n==`function`||(n==null||!1===n&&t[4]!=`-`?e.removeAttribute(t):e.setAttribute(t,t==`popover`&&n==1?``:n))}}function P(e){return function(n){if(this.l){var r=this.l[n.type+e];if(n[c]==null)n[c]=d++;else if(n[c]<r[l])return;return r(t.event?t.event(n):n)}}}function F(e,n,r,i,a,o,s,c,l,u){var d,f,p,m,g,b,x,w,T,E,D,O,k,A,j,M,N=n.type;if(n.constructor!==void 0)return null;128&r.__u&&(l=!!(32&r.__u),o=[c=n.__e=r.__e]),(d=t.__b)&&d(n);n:if(typeof N==`function`){f=s.length;try{if(T=n.props,E=N.prototype&&N.prototype.render,D=(d=N.contextType)&&i[d.__c],O=d?D?D.props.value:d.__:i,r.__c?w=(p=n.__c=r.__c).__=p.__E:(E?n.__c=p=new N(T,O):(n.__c=p=new C(T,O),p.constructor=N,p.render=oe),D&&D.sub(p),p.state||={},p.__n=i,m=p.__d=!0,p.__h=[],p._sb=[]),E&&p.__s==null&&(p.__s=p.state),E&&N.getDerivedStateFromProps!=null&&(p.__s==p.state&&(p.__s=v({},p.__s)),v(p.__s,N.getDerivedStateFromProps(T,p.__s))),g=p.props,b=p.state,p.__v=n,m)E&&N.getDerivedStateFromProps==null&&p.componentWillMount!=null&&p.componentWillMount(),E&&p.componentDidMount!=null&&p.__h.push(p.componentDidMount);else{if(E&&N.getDerivedStateFromProps==null&&T!==g&&p.componentWillReceiveProps!=null&&p.componentWillReceiveProps(T,O),n.__v==r.__v||!p.__e&&p.shouldComponentUpdate!=null&&!1===p.shouldComponentUpdate(T,p.__s,O)){n.__v!=r.__v&&(p.props=T,p.state=p.__s,p.__d=!1),n.__e=r.__e,n.__k=r.__k,n.__k.some(function(e){e&&(e.__=n)}),h.push.apply(p.__h,p._sb),p._sb=[],p.__h.length&&s.push(p);break n}p.componentWillUpdate!=null&&p.componentWillUpdate(T,p.__s,O),E&&p.componentDidUpdate!=null&&p.__h.push(function(){p.componentDidUpdate(g,b,x)})}if(p.context=O,p.props=T,p.__P=e,p.__e=!1,k=t.__r,A=0,E)p.state=p.__s,p.__d=!1,k&&k(n),d=p.render(p.props,p.state,p.context),h.push.apply(p.__h,p._sb),p._sb=[];else do p.__d=!1,k&&k(n),d=p.render(p.props,p.state,p.context),p.state=p.__s;while(p.__d&&++A<25);p.state=p.__s,p.getChildContext!=null&&(i=v(v({},i),p.getChildContext())),E&&!m&&p.getSnapshotBeforeUpdate!=null&&(x=p.getSnapshotBeforeUpdate(g,b)),j=d!=null&&d.type===S&&d.key==null?re(d.props.children):d,c=ee(e,_(j)?j:[j],n,r,i,a,o,s,c,l,u),p.base=n.__e,n.__u&=-161,p.__h.length&&s.push(p),w&&(p.__E=p.__=null)}catch(e){if(s.length=f,n.__v=null,l||o!=null){if(e.then){for(n.__u|=l?160:128;c&&c.nodeType==8&&c.nextSibling;)c=c.nextSibling;o!=null&&(o[o.indexOf(c)]=null),n.__e=c}else if(o!=null)for(M=o.length;M--;)y(o[M])}else n.__e=r.__e;n.__k??=r.__k||[],e.then||te(n),t.__e(e,n,r)}}else o==null&&n.__v==r.__v?(n.__k=r.__k,n.__e=r.__e):c=n.__e=ie(r.__e,n,r,i,a,o,s,l,u);return(d=t.diffed)&&d(n),128&n.__u?void 0:c}function te(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(te))}function ne(e,n,r){for(var i=0;i<r.length;i++)I(r[i],r[++i],r[++i]);t.__c&&t.__c(n,e),e.some(function(n){try{e=n.__h,n.__h=[],e.some(function(e){e.call(n)})}catch(e){t.__e(e,n.__v)}})}function re(e){return typeof e!=`object`||!e||e.__b>0?e:_(e)?e.map(re):e.constructor===void 0?v({},e):null}function ie(n,r,i,a,o,s,c,l,u){var d,f,p,h,g,v,b,x=i.props||m,S=r.props,C=r.type;if(C==`svg`?o=`http://www.w3.org/2000/svg`:C==`math`?o=`http://www.w3.org/1998/Math/MathML`:o||=`http://www.w3.org/1999/xhtml`,s!=null){for(d=0;d<s.length;d++)if((g=s[d])&&`setAttribute`in g==!!C&&(C?g.localName==C:g.nodeType==3)){n=g,s[d]=null;break}}if(n==null){if(C==null)return document.createTextNode(S);n=document.createElementNS(o,C,S.is&&S),l&&=(t.__m&&t.__m(r,s),!1),s=null}if(C==null)x===S||l&&n.data==S||(n.data=S);else{if(s=C==`textarea`&&S.defaultValue!=null?null:s&&e.call(n.childNodes),!l&&s!=null)for(x={},d=0;d<n.attributes.length;d++)x[(g=n.attributes[d]).name]=g.value;for(d in x)g=x[d],d==`dangerouslySetInnerHTML`?p=g:d==`children`||d in S||d==`value`&&`defaultValue`in S||d==`checked`&&`defaultChecked`in S||N(n,d,null,g,o);for(d in S)g=S[d],d==`children`?h=g:d==`dangerouslySetInnerHTML`?f=g:d==`value`?v=g:d==`checked`?b=g:l&&typeof g!=`function`||x[d]===g||N(n,d,g,x[d],o);if(f)l||p&&(f.__html==p.__html||f.__html==n.innerHTML)||(n.innerHTML=f.__html),r.__k=[];else if(p&&(n.innerHTML=``),ee(r.type==`template`?n.content:n,_(h)?h:[h],r,i,a,C==`foreignObject`?`http://www.w3.org/1999/xhtml`:o,s,c,s?s[0]:i.__k&&w(i,0),l,u),s!=null)for(d=s.length;d--;)y(s[d]);l&&C!=`textarea`||(d=`value`,C==`progress`&&v==null?n.removeAttribute(`value`):v!=null&&(v!==n[d]||C==`progress`&&!v||C==`option`&&v!=x[d])&&N(n,d,v,x[d],o),d=`checked`,b!=null&&b!=n[d]&&N(n,d,b,x[d],o))}return n}function I(e,n,r){try{if(typeof e==`function`){var i=typeof e.__u==`function`;i&&e.__u(),i&&n==null||(e.__u=e(n))}else e.current=n}catch(e){t.__e(e,r)}}function ae(e,n,r){var i,a;if(t.unmount&&t.unmount(e),(i=e.ref)&&(i.current&&i.current!=e.__e||I(i,null,n)),(i=e.__c)!=null){if(i.componentWillUnmount)try{i.componentWillUnmount()}catch(e){t.__e(e,n)}i.base=i.__P=i.__n=null}if(i=e.__k)for(a=0;a<i.length;a++)i[a]&&ae(i[a],n,r||typeof e.type!=`function`);r||y(e.__e),e.__c=e.__=e.__e=void 0}function oe(e,t,n){return this.constructor(e,n)}function se(n,r,i){var a,o,s,c;r==document&&(r=document.documentElement),t.__&&t.__(n,r),o=(a=typeof i==`function`)?null:i&&i.__k||r.__k,s=[],c=[],F(r,n=(!a&&i||r).__k=b(S,null,[n]),o||m,m,r.namespaceURI,!a&&i?[i]:o?null:r.firstChild?e.call(r.childNodes):null,s,!a&&i?i:o?o.__e:r.firstChild,a,c),ne(s,n,c),n.props.children=null}e=h.slice,t={__e:function(e,t,n,r){for(var i,a,o;t=t.__;)if((i=t.__c)&&!i.__)try{if((a=i.constructor)&&a.getDerivedStateFromError!=null&&(i.setState(a.getDerivedStateFromError(e)),o=i.__d),i.componentDidCatch!=null&&(i.componentDidCatch(e,r||{}),o=i.__d),o)return i.__E=i}catch(t){e=t}throw e}},n=0,C.prototype.setState=function(e,t){var n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=v({},this.state);typeof e==`function`&&(e=e(v({},n),this.props)),e&&v(n,e),e!=null&&this.__v&&(t&&this._sb.push(t),D(this))},C.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),D(this))},C.prototype.render=S,r=[],a=typeof Promise==`function`?Promise.prototype.then.bind(Promise.resolve()):setTimeout,o=function(e,t){return e.__v.__b-t.__v.__b},O.__r=0,s=Math.random().toString(8),c=`__d`+s,l=`__a`+s,u=/(PointerCapture)$|Capture$/i,d=0,f=P(!1),p=P(!0);var L,R,z,ce,B=0,le=[],V=t,H=V.__b,U=V.__r,W=V.diffed,G=V.__c,K=V.unmount,ue=V.__;function de(e,t){V.__h&&V.__h(R,e,B||t),B=0;var n=R.__H||={__:[],__h:[]};return e>=n.__.length&&n.__.push({}),n.__[e]}function q(e){return B=1,fe(ge,e)}function fe(e,t,n){var r=de(L++,2);if(r.t=e,!r.__c&&(r.__=[n?n(t):ge(void 0,t),function(e){var t=r.__N?r.__N[0]:r.__[0],n=r.t(t,e);t!==n&&(r.__N=[n,r.__[1]],r.__c.setState({}))}],r.__c=R,!R.__f)){var i=function(e,t,n){if(!r.__c.__H)return!0;var i=!1,o=r.__c.props!==e;if(r.__c.__H.__.some(function(e){if(e.__N){i=!0;var t=e.__[0];e.__=e.__N,e.__N=void 0,t!==e.__[0]&&(o=!0)}}),a){var s=a.call(this,e,t,n);return i?s||o:s}return!i||o};R.__f=!0;var a=R.shouldComponentUpdate,o=R.componentWillUpdate;R.componentWillUpdate=function(e,t,n){if(this.__e){var r=a;a=void 0,i(e,t,n),a=r}o&&o.call(this,e,t,n)},R.shouldComponentUpdate=i}return r.__N||r.__}function pe(){for(var e;e=le.shift();){var t=e.__H;if(e.__P&&t)try{t.__h.some(J),t.__h.some(Y),t.__h=[]}catch(n){t.__h=[],V.__e(n,e.__v)}}}V.__b=function(e){R=null,H&&H(e)},V.__=function(e,t){e&&t.__k&&t.__k.__m&&(e.__m=t.__k.__m),ue&&ue(e,t)},V.__r=function(e){U&&U(e),L=0;var t=(R=e.__c).__H;t&&(z===R?(t.__h=[],R.__h=[],t.__.some(function(e){e.__N&&(e.__=e.__N),e.u=e.__N=void 0})):(t.__h.some(J),t.__h.some(Y),t.__h=[],L=0)),z=R},V.diffed=function(e){W&&W(e);var t=e.__c;t&&t.__H&&(t.__H.__h.length&&(le.push(t)!==1&&ce===V.requestAnimationFrame||((ce=V.requestAnimationFrame)||he)(pe)),t.__H.__.some(function(e){e.u&&=(e.__H=e.u,void 0)})),z=R=null},V.__c=function(e,t){t.some(function(e){try{e.__h.some(J),e.__h=e.__h.filter(function(e){return!e.__||Y(e)})}catch(n){t.some(function(e){e.__h&&=[]}),t=[],V.__e(n,e.__v)}}),G&&G(e,t)},V.unmount=function(e){K&&K(e);var t,n=e.__c;n&&n.__H&&(n.__H.__.some(function(e){try{J(e)}catch(e){t=e}}),n.__H=void 0,t&&V.__e(t,n.__v))};var me=typeof requestAnimationFrame==`function`;function he(e){var t,n=function(){clearTimeout(r),me&&cancelAnimationFrame(t),setTimeout(e)},r=setTimeout(n,35);me&&(t=requestAnimationFrame(n))}function J(e){var t=R,n=e.__c;typeof n==`function`&&(e.__c=void 0,n()),R=t}function Y(e){var t=R;e.__c=e.__(),R=t}function ge(e,t){return typeof t==`function`?t(e):t}var _e={tr:{heading:`Daha sürdürülebilir bir konaklamayı destekle`,subheading:e=>`${e}'in sürdürülebilirlik programını desteklemek için bir tercih — karbon nötrlüğü garanti etmez.`,checkboxLabel:`Bu seçeneği tercih ediyorum`,totalLabel:`Toplam katkı`,co2Label:`Tahmini karbon etkisi`,estimatedBadge:`Tahmini`,perNight:(e,t,n)=>t>1?`${e} × ${t} oda × ${n} gece`:`${e} × ${n} gece`,addButton:`Tercihimi kaydet`,confirmation:`Tercihinizi kaydettik. Rezervasyonunuza henüz herhangi bir ücret eklenmedi.`,co2Note:`Ayak izi tahminidir; kesin ölçüm değildir.`,previewBadge:`Önizleme`,brandLine:`Sürdürülebilir konaklama`,eyebrow:`Gönüllü katkı`,savedTotalLabel:`Seçtiğiniz katkı`,signatureLead:`Destekleyen:`,stayLabel:`Konaklamanız`,stayValue:(e,t)=>t>1?`${e} gece · ${t} oda`:`${e} gece`,footprintLabel:`Tahmini ayak iziniz`,impactLine:(e,t)=>`Bu ay bu otelde seçilen konaklamaların tahmini emisyonu ≈ ${e} kg CO₂e`,sourceNote:(e,t,n)=>`${t?`Ölçülen enerji tüketimine dayalı tahmin (Kapsam 1 ve 2)`:e===`hotel`?`Otel verileriyle tahmin`:`Bölgesel tahmin`} · Temsili fiyat · ${n} oda`,measuredNote:`Doğrulanmış bir emisyon beyanı değildir.`},en:{heading:`Support a more sustainable stay`,subheading:e=>`A preference to support ${e}'s sustainability program — this does not guarantee carbon neutrality.`,checkboxLabel:`I am interested in this option`,totalLabel:`Total contribution`,co2Label:`Estimated carbon impact`,estimatedBadge:`Estimated`,perNight:(e,t,n)=>t>1?`${e} × ${t} rooms × ${n} night${n===1?``:`s`}`:`${e} × ${n} night${n===1?``:`s`}`,addButton:`Save my preference`,confirmation:`Your preference has been recorded. No charge has been added to your booking.`,co2Note:`The footprint is an estimate, not an exact measurement.`,previewBadge:`Preview`,brandLine:`Sustainable stay`,eyebrow:`Voluntary contribution`,savedTotalLabel:`Your selected contribution`,signatureLead:`Powered by`,stayLabel:`Your stay`,stayValue:(e,t)=>`${e} night${e===1?``:`s`}`+(t>1?` · ${t} rooms`:``),footprintLabel:`Your estimated footprint`,impactLine:(e,t)=>`This month, the estimated footprint of stays choosing this option ≈ ${e} kg CO₂e`,sourceNote:(e,t,n)=>`${t?`Estimate based on measured energy use (Scope 1 and 2)`:e===`hotel`?`Hotel-based estimate`:`Regional estimate`} · Indicative price · ${n} room${n===1?``:`s`}`,measuredNote:`This is not a verified emissions statement.`}};function ve(e,t){let n=_e[e],r=t?.[e];return r?{...n,heading:r.heading||n.heading,checkboxLabel:r.checkboxLabel||n.checkboxLabel,addButton:r.addButton||n.addButton,confirmation:r.confirmation||n.confirmation}:n}var ye=`#006e64`,be=/^#[0-9a-fA-F]{6}$/;function X(e){let t=e/255;return t<=.03928?t/12.92:((t+.055)/1.055)**2.4}function xe(e){let t=parseInt(e.slice(1),16);return .2126*X(t>>16&255)+.7152*X(t>>8&255)+.0722*X(t&255)}function Se(e,t){let[n,r]=[xe(e),xe(t)].sort((e,t)=>t-e);return(n+.05)/(r+.05)}function Ce(e){return e&&be.test(e)&&Se(e,`#ffffff`)>=4.5?{accent:e.toLowerCase(),fromHotel:!0}:{accent:ye,fromHotel:!1}}var we=0;Array.isArray;function Z(e,n,r,i,a,o){n||={};var s,c,l=n;if(`ref`in l)for(c in l={},n)c==`ref`?s=n[c]:l[c]=n[c];var u={type:e,props:l,key:r,ref:s,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--we,__i:-1,__u:0,__source:a,__self:o};if(typeof e==`function`&&(s=e.defaultProps))for(c in s)l[c]===void 0&&(l[c]=s[c]);return t.vnode&&t.vnode(u),u}function Te(e,t,n){return Math.round(e*100)*t*n/100}function Ee(e,t,n){return e*t*n}function De(e){let{accent:t,fromHotel:n}=Ce(e);return n?`--gg-accent:${t}`:void 0}function Oe(e){if(!e)return null;try{return new URL(e).protocol===`https:`?e:null}catch{return null}}function ke(e,t,n){let r=n===`tr`?`tr-TR`:`en-GB`;try{let n=Number.isInteger(e);return new Intl.NumberFormat(r,{style:`currency`,currency:t,minimumFractionDigits:n?0:2,maximumFractionDigits:2}).format(e)}catch{return`${e} ${t}`}}function Ae(){return Z(`svg`,{viewBox:`0 0 24 24`,fill:`none`,"aria-hidden":`true`,children:[Z(`path`,{d:`M4 20c0-8 6-14 16-14 0 10-6 14-14 14`,stroke:`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`,"stroke-linejoin":`round`}),Z(`path`,{d:`M8 16c3-3 6-4.5 9-5`,stroke:`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`})]})}function je(){return Z(`svg`,{viewBox:`0 0 32 32`,"aria-hidden":`true`,children:[Z(`circle`,{cx:`16`,cy:`16`,r:`15`,fill:`#0b393a`}),Z(`circle`,{cx:`16`,cy:`16`,r:`12.5`,fill:`none`,stroke:`#d3a632`,"stroke-width":`1.2`}),Z(`path`,{d:`M16 24v-9`,stroke:`#f3cc61`,"stroke-width":`1.6`,"stroke-linecap":`round`}),Z(`path`,{d:`M16 17c-3.6 0-5.6-2.2-5.6-5.4 3.4 0 5.6 2 5.6 5.4Zm0-1.6c0-3.4 2.2-5.6 5.6-5.6 0 3.4-2.2 5.6-5.6 5.6Z`,fill:`#8be3d1`})]})}function Me(){return Z(`svg`,{viewBox:`0 0 24 24`,fill:`none`,"aria-hidden":`true`,children:Z(`path`,{d:`M20 6L9 17l-5-5`,stroke:`currentColor`,"stroke-width":`2.2`,"stroke-linecap":`round`,"stroke-linejoin":`round`})})}function Ne({config:e,nights:t,rooms:n,lang:r,onSelect:i,onAdd:a,preview:o,impact:s,brandLogo:c}){let l=ve(r,e.content_overrides),u=e.carbon_estimate_basis===`measured_scope_1_2`,d=r===`tr`?`tr-TR`:`en-GB`,f=(e,t=1)=>e.toLocaleString(d,{maximumFractionDigits:t}),p=!!e.show_estimated_impact&&!!s&&s.estimated_co2_kg>0,[m,h]=q(!1),[g,_]=q(!1),[v,y]=q(!1),b=Te(e.amount_per_night,t,n),x=Ee(e.estimated_co2_per_night_kg,t,n),S=(!!e.show_estimated_impact||!!e.carbon_pricing_demo)&&x>0,C=t=>ke(t,e.currency,r),w=De(e.brand_color),T=Oe(e.logo_url),E=v?null:Oe(c)??null;return Z(`div`,{class:o?`card preview`:`card`,part:`card`,style:w,lang:r,children:[Z(`div`,{class:`head`,children:[Z(`span`,{class:T?`mark has-logo`:`mark`,children:T?Z(`img`,{class:`logo`,src:T,alt:``}):Z(`span`,{class:`initial`,"aria-hidden":`true`,children:Pe(e.hotel_name)})}),Z(`span`,{class:`brand`,children:[Z(`span`,{class:`hotel`,children:e.hotel_name}),Z(`span`,{class:`brand-sub`,children:e.city?`${e.city} · ${l.brandLine}`:l.brandLine})]}),o&&Z(`span`,{class:`preview-badge`,children:l.previewBadge})]}),Z(`div`,{class:`body`,children:[Z(`p`,{class:`eyebrow`,children:l.eyebrow}),Z(`h3`,{class:`heading`,children:l.heading}),Z(`p`,{class:`subheading`,children:l.subheading(e.hotel_name)}),Z(`div`,{class:`summary`,children:[Z(`div`,{class:`rowval stay`,children:[Z(`span`,{class:`rowval-label`,children:l.stayLabel}),Z(`span`,{class:`rowval-value`,children:l.stayValue(t,n)})]}),S&&Z(`div`,{class:`rowval footprint`,children:[Z(`span`,{class:`rowval-label`,children:[Z(Ae,{}),l.footprintLabel]}),Z(`span`,{class:`co2-value`,children:[Z(`b`,{class:`big`,children:[`≈ `,f(x,x<10?2:1)]}),Z(`span`,{class:`unit`,children:`kg CO₂e`}),e.is_estimated&&Z(`span`,{class:`badge`,children:l.estimatedBadge})]})]})]}),Z(`label`,{class:m||g?`row checked`:`row`,children:[Z(`input`,{type:`checkbox`,checked:m,disabled:g,onChange:e=>{let t=e.currentTarget.checked;h(t),t&&i(b)}}),Z(`span`,{class:`row-body`,children:[Z(`span`,{class:`row-label`,children:l.checkboxLabel}),Z(`span`,{class:`row-sub`,children:l.perNight(C(e.amount_per_night),n,t)})]})]}),(m||g)&&Z(`div`,{class:g?`details saved`:`details`,"aria-live":`polite`,children:Z(`div`,{class:`line`,children:[Z(`span`,{class:`line-label`,children:g?l.savedTotalLabel:l.totalLabel}),Z(`span`,{class:`line-value`,children:C(b)})]})}),!g&&Z(`div`,{class:`actions`,children:Z(`button`,{type:`button`,class:`btn`,disabled:!m,onClick:()=>{m&&(a(b),_(!0))},children:l.addButton})}),g&&Z(`div`,{class:`confirm`,role:`status`,"aria-live":`polite`,children:[Z(Me,{}),Z(`span`,{children:l.confirmation})]}),Z(`div`,{class:`notes`,children:[S&&e.is_estimated&&Z(`p`,{class:`footprint-note`,children:l.co2Note}),e.carbon_pricing_demo&&Z(`p`,{class:`co2-note`,children:l.sourceNote(e.carbon_estimate_source,u,n)}),e.carbon_pricing_demo&&u&&Z(`p`,{class:`co2-note measured-note`,children:l.measuredNote}),p&&s&&Z(`p`,{class:`impact`,children:[Z(`span`,{children:l.impactLine(f(s.estimated_co2_kg),f(s.tree_equivalent))}),Z(`span`,{class:`badge`,children:l.estimatedBadge})]})]})]}),Z(`div`,{class:`signature`,children:[Z(`span`,{class:`sig-mark`,children:E?Z(`img`,{src:E,alt:``,onError:()=>y(!0)}):Z(je,{})}),Z(`span`,{children:[l.signatureLead,` `,Z(`b`,{children:`GreenGold Stay`})]})]})]})}function Pe(e){return(e.trim()[0]??`G`).toLocaleUpperCase(`tr-TR`)}var Fe=`
:host {
  all: initial;
  display: block;
  contain: content;
  container-type: inline-size;
  /* Vurgu: otel rengi yalnız okunabilirlik denetimini geçerse (colors.ts). */
  --gg-accent: #006e64;
  --gg-ink: #0b393a;
  --gg-sub: #4d625a;
  --gg-rule: #d6ded2;
  --gg-rule-strong: #c9d5c9;
  --gg-sage: #f2f5ed;
  --gg-gold: #f3cc61;
  --gg-gold-rule: #d3a632;
  font-family: "GG DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.45;
  color: var(--gg-ink);
  -webkit-font-smoothing: antialiased;
}
*, *::before, *::after { box-sizing: border-box; }

.card {
  width: 100%;
  min-width: min(100%, 280px);
  max-width: 560px;
  background: #ffffff;
  border: 1px solid var(--gg-rule-strong);
  border-radius: 18px;
  overflow: hidden;
  color: var(--gg-ink);
  font-size: 15px;
  box-shadow: 0 1px 2px rgba(11, 57, 58, .04), 0 12px 32px -18px rgba(11, 57, 58, .28);
}

/* Başlık şeridi (KD-2): OTELİN kimliği — logo/baş harf + ad + şehir */
.head {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 20px;
  background: var(--gg-sage);
  border-bottom: 1px solid var(--gg-rule);
}
.mark {
  flex: 0 0 auto;
  width: 40px; height: 40px;
  display: grid; place-items: center;
  border-radius: 999px;
  background: var(--gg-ink);
  overflow: hidden;
}
.mark .initial { font-size: 17px; font-weight: 600; color: var(--gg-gold); letter-spacing: -0.02em; }
.mark svg { width: 18px; height: 18px; display: block; color: var(--gg-gold); }
.mark.has-logo { background: #ffffff; border: 1px solid var(--gg-rule); border-radius: 10px; padding: 3px; }
.logo { width: 100%; height: 100%; object-fit: contain; display: block; }
.brand { display: flex; flex-direction: column; min-width: 0; }
.hotel {
  /* Otel adı olduğu gibi (büyük harfe çevrilmez: TR/EN adlarda İ/I sorunu). */
  font-size: 15px; font-weight: 700; letter-spacing: -0.01em;
  color: var(--gg-ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.brand-sub { font-size: 12.5px; color: var(--gg-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.preview-badge {
  margin-left: auto; flex: 0 0 auto;
  font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  color: var(--gg-ink); background: #ffffff; border: 1px solid var(--gg-rule-strong);
  padding: 4px 8px; border-radius: 999px;
  white-space: nowrap;
}

.body { padding: 22px 24px 20px; }
.eyebrow {
  display: flex; align-items: center; gap: 8px;
  margin: 0 0 8px;
  font-size: 11.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
  color: var(--gg-accent);
}
.eyebrow::before { content: ""; width: 18px; height: 2px; border-radius: 2px; background: var(--gg-gold-rule); }
.heading {
  margin: 0;
  font-size: 23px; font-weight: 600; letter-spacing: -0.04em; line-height: 1.18;
  color: var(--gg-ink);
}
.subheading { margin: 8px 0 0; font-size: 14px; line-height: 1.5; color: var(--gg-sub); }

/* Konaklama özeti + tahmini ayak izi (referans: açık adaçayı panel) */
.summary {
  margin-top: 18px;
  padding: 4px 16px;
  border-radius: 12px;
  background: var(--gg-sage);
  border: 1px solid #e3eadc;
}
.rowval {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 12px 0;
}
.rowval + .rowval { border-top: 1px solid #dfe7d6; }
.rowval-label { display: inline-flex; align-items: center; gap: 7px; font-size: 14.5px; color: var(--gg-ink); }
.rowval-label svg { width: 16px; height: 16px; color: var(--gg-accent); flex: 0 0 auto; }
.rowval-value { font-size: 15px; font-weight: 700; color: var(--gg-ink); text-align: right; }
.co2-value { display: inline-flex; align-items: baseline; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.big { font-size: 32px; font-weight: 600; letter-spacing: -0.05em; line-height: 1.05; color: var(--gg-ink); font-variant-numeric: tabular-nums; }
.unit { font-size: 14px; font-weight: 600; color: var(--gg-ink); }

/* Seçenek: misafirin kararı (büyük, net tıklama alanı) */
.row {
  display: flex; align-items: flex-start; gap: 12px;
  margin-top: 14px;
  padding: 14px 16px; border-radius: 12px;
  border: 1.5px solid var(--gg-rule-strong); background: #ffffff;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.row:hover { border-color: var(--gg-accent); }
.row.checked { border-color: var(--gg-accent); background: #f7faf4; box-shadow: 0 0 0 3px rgba(0, 110, 100, .08); }
.row input[type=checkbox] {
  flex: 0 0 auto;
  width: 20px; height: 20px; margin: 1px 0 0;
  accent-color: var(--gg-accent);
  cursor: pointer;
}
.row-body { flex: 1 1 auto; min-width: 0; }
.row-label { display: block; font-weight: 700; font-size: 15.5px; color: var(--gg-ink); }
.row-sub { display: block; font-size: 13.5px; color: var(--gg-sub); margin-top: 3px; font-variant-numeric: tabular-nums; }

/* Toplam katkı: seçildiğinde belirgin; kaydedildikten sonra da kalır */
.details { margin-top: 12px; }
.line {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  padding: 12px 16px; border-radius: 12px;
  background: var(--gg-ink); color: #ffffff;
}
.line-label { font-size: 14px; color: #d0e3e1; }
.line-value { font-size: 24px; font-weight: 600; letter-spacing: -0.03em; color: #ffffff; font-variant-numeric: tabular-nums; }
.details.saved .line { background: #e5f1e9; color: var(--gg-ink); border: 1px solid #bcdcc8; }
.details.saved .line-label { color: var(--gg-ink); }
.details.saved .line-value { color: var(--gg-ink); }

.badge {
  display: inline-block;
  font-size: 10.5px; font-weight: 700; letter-spacing: .05em;
  text-transform: uppercase;
  color: #7a5a12; background: #f5ecd3; border: 1px solid #e6d29c;
  padding: 2px 8px; border-radius: 21px;
  white-space: nowrap;
}

.actions { margin-top: 14px; display: flex; }
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 100%;
  min-height: 48px;
  font-size: 15.5px; font-weight: 650; font-family: inherit;
  color: #ffffff; background: var(--gg-accent);
  border: 1px solid transparent; border-radius: 10px;
  padding: 11px 22px; cursor: pointer;
  transition: filter .15s ease, background .15s ease;
}
.btn:hover:not(:disabled) { filter: brightness(0.9); }
.btn:disabled { background: #e3e9df; color: #5f726b; cursor: not-allowed; }
.btn:focus-visible, .row input:focus-visible {
  outline: 3px solid var(--gg-accent); outline-offset: 2px;
}

.confirm {
  margin-top: 12px;
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px; border-radius: 12px;
  background: #ffffff; border: 1px solid #bcdcc8;
  color: var(--gg-ink); font-size: 14px;
}
.confirm svg { flex: 0 0 auto; width: 18px; height: 18px; color: #256b45; margin-top: 1px; }

/* Notlar (UX-4.8): kısa, tek blok, küçük punto */
.notes { margin-top: 16px; display: flex; flex-direction: column; gap: 4px; }
.notes:empty { display: none; }
.footprint-note, .co2-note { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--gg-sub); }
.impact {
  margin: 6px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--gg-rule);
  font-size: 12.5px; color: var(--gg-sub);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}

/* KD-2: GreenGold Stay imzası (altta) */
.signature {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 24px;
  border-top: 1px solid var(--gg-rule);
  font-size: 12px; color: var(--gg-sub);
}
.signature b { color: var(--gg-ink); font-weight: 700; letter-spacing: -0.01em; }
.sig-mark { width: 22px; height: 22px; flex: 0 0 auto; display: block; border-radius: 999px; overflow: hidden; }
.sig-mark img, .sig-mark svg { width: 100%; height: 100%; display: block; object-fit: cover; }

@media (prefers-reduced-motion: reduce) {
  .row, .btn { transition: none; }
}

/* Dar kapsayıcı (otel sitesinin yan sütunu, mobil) */
@container (max-width: 420px) {
  .head { padding: 12px 16px; }
  .body { padding: 18px 16px 16px; }
  .heading { font-size: 20px; }
  .big { font-size: 27px; }
  .summary { padding: 2px 12px; }
  .rowval.footprint { flex-direction: column; align-items: flex-start; gap: 4px; }
  .co2-value { justify-content: flex-start; }
  .signature { padding: 10px 16px; }
}
@supports not (container-type: inline-size) {
  @media (max-width: 460px) {
    .head { padding: 12px 16px; }
    .body { padding: 16px 16px 18px; }
    .heading { font-size: 20px; }
  }
}
`;async function Ie(e,t){try{let n=await fetch(`${e}/widget/config?key=${encodeURIComponent(t)}`);if(!n.ok)return null;let r=await n.json();return!r.success||!r.data?null:r.data}catch{return null}}async function Le(e,t){try{let n=await fetch(`${e}/widget/impact?key=${encodeURIComponent(t)}`);if(!n.ok)return null;let r=await n.json();return!r.success||!r.data?null:r.data}catch{return null}}function Re(e,t,n,r,i){try{fetch(`${e}/widget/events`,{method:`POST`,headers:{"Content-Type":`application/json`,"X-Widget-Key":t},body:JSON.stringify({event_type:n,session_ref:r,metadata:i}),keepalive:!0}).catch(()=>{})}catch{}}var ze=`GG DM Sans`,Be=`green-gold-widget-fonts`,Ve=`U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD`,He=`U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF`;function Ue(e){if(!e)return null;try{let t=new URL(e,typeof location<`u`?location.href:void 0);return t.protocol!==`https:`&&t.protocol!==`http:`?null:`${t.origin}/green-gold-widget-fonts/`}catch{return null}}function We(e){let t=(t,n)=>`@font-face{font-family:"${ze}";font-style:normal;font-weight:100 1000;font-display:swap;src:url("${e}${t}") format("woff2");unicode-range:${n};}`;return t(`dm-sans-latin.v1.woff2`,Ve)+t(`dm-sans-latin-ext.v1.woff2`,He)}function Ge(e,t=document){if(!e)return!1;try{if(t.getElementById(Be))return!0;let n=t.createElement(`style`);return n.id=Be,n.textContent=We(e),(t.head??t.documentElement).appendChild(n),!0}catch{return!1}}var Ke=`http://localhost:3000`,qe=`green-gold-widget`,Q=Ue(typeof document<`u`?document.currentScript?.src:null),Je=Q?Q.replace(/green-gold-widget-fonts\/$/,`brand/greengold-logo.png`):null,Ye=365,Xe=1e3;function Ze(e,t){let n=Number(e);if(!Number.isFinite(n)||n<1)return 1;let r=Math.floor(n);return r<=t?r:1}function Qe(e){return Ze(e,Ye)}function $e(e){return Ze(e,Xe)}function et(e){return e===`en`?`en`:`tr`}function $(){return typeof crypto<`u`&&`randomUUID`in crypto?crypto.randomUUID():`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g,e=>{let t=Math.random()*16|0;return(e===`x`?t:t&3|8).toString(16)})}var tt=`greengold_journey_id`,nt=100;function rt(e){let t=e?.trim();if(t&&t.length<=nt)return t;try{let e=window.sessionStorage.getItem(tt);if(e)return e;let t=$();return window.sessionStorage.setItem(tt,t),t}catch{return $()}}var it=class e extends HTMLElement{static get observedAttributes(){return[`data-nights`,`data-rooms`,`data-lang`,`data-preview-amount`,`data-preview-co2`,`data-preview-currency`,`data-preview-source`,`data-preview-basis`]}mount;config=null;impact=null;sessionRef=``;key=``;apiBase=Ke;preview=!1;trackerOnly=!1;sentEvents=new Set;async connectedCallback(){if(this.key=this.getAttribute(`data-key`)??``,this.key&&(this.apiBase=this.getAttribute(`data-api`)??Ke,this.preview=this.getAttribute(`data-preview`)===`true`,this.trackerOnly=this.getAttribute(`data-tracker-only`)===`true`,this.sessionRef||=rt(this.getAttribute(`data-journey-id`)),!this.trackerOnly)){if(Ge(Q),this.shadowRoot)this.mount||=this.shadowRoot.querySelector(`div`)??void 0;else{let e=this.attachShadow({mode:`open`}),t=document.createElement(`style`);t.textContent=Fe,this.mount=document.createElement(`div`),e.append(t,this.mount)}if(!this.config){let e=await Ie(this.apiBase,this.key);if(!e)return;this.config=e}this.rerender(),this.sendOnce(`widget_goruntulendi`,{nights:this.nights()}),this.loadImpact()}}async loadImpact(){if(this.impact)return;let e=await Le(this.apiBase,this.key);e&&(this.impact=e,this.rerender())}sendOnce(e,t){this.preview||this.sentEvents.has(e)||(this.sentEvents.add(e),Re(this.apiBase,this.key,e,this.sessionRef,t))}attributeChangedCallback(t){e.observedAttributes.includes(t)&&this.config&&this.mount&&this.rerender()}disconnectedCallback(){this.mount&&se(null,this.mount)}nights(){return Qe(this.getAttribute(`data-nights`))}withPreviewOverride(e){if(!this.preview)return e;let t=Number(this.getAttribute(`data-preview-amount`)),n=Number(this.getAttribute(`data-preview-co2`)),r=this.getAttribute(`data-preview-currency`),i=this.getAttribute(`data-preview-source`)===`regional`?`regional`:`hotel`,a=this.getAttribute(`data-preview-basis`)===`measured_scope_1_2`?`measured_scope_1_2`:void 0;return!Number.isFinite(t)||t<0||!Number.isFinite(n)||n<=0||!r?e:{...e,amount_per_night:t,estimated_co2_per_night_kg:n,currency:r,carbon_pricing_demo:!0,carbon_estimate_source:i,carbon_estimate_basis:a}}rooms(){return $e(this.getAttribute(`data-rooms`))}rerender(){if(!this.config||!this.mount)return;let e=et(this.getAttribute(`data-lang`));se(Z(Ne,{config:this.withPreviewOverride(this.config),nights:this.nights(),rooms:this.rooms(),lang:e,onSelect:e=>this.sendOnce(`checkbox_secildi`,{nights:this.nights(),rooms:this.rooms(),amount_total:e}),onAdd:e=>this.handleAdd(e),preview:this.preview,impact:this.impact,brandLogo:Je}),this.mount)}handleAdd(e){this.sendOnce(`katki_ekle_butonuna_basildi`,{nights:this.nights(),rooms:this.rooms(),amount_total:e}),this.dispatchEvent(new CustomEvent(`greengold:contribution-selected`,{bubbles:!0,composed:!0,detail:{session_ref:this.sessionRef,nights:this.nights(),rooms:this.rooms(),amount_total:e,currency:this.config?.currency??null}}))}trackBookingEngineClick(){this.key&&this.sendOnce(`booking_engine_clicked`,{})}};customElements.get(qe)||customElements.define(qe,it)})();