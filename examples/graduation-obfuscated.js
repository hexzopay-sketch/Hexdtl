// HexDTL Graduation Test Script
// Production-grade obfuscated JS — fully runnable with inspect
// Run:  npm run dev inspect examples/graduation-obfuscated.js
// Run:  npx hexdtl beautify examples/graduation-obfuscated.js
//
// Original (deobfuscated) logic:
//   function verifyToken(token, secret) {
  //     if (!token || token.length < 10)
  //       return { valid: false, error: 'invalid token' };
  //     const parts = token.split('.');
  //     const payload = JSON.parse(atob(parts[1]));
  //     const now = Math.floor(Date.now() / 1000);
  //     if (payload.exp && payload.exp < now)
  //       throw new Error('token expired');
  //     if (payload.nbf && payload.nbf > now)
  //       throw new Error('token not yet valid');
  //     return { valid: true, user: payload.sub, role: payload.role || 'viewer' };
  //   }

var _0xabcd=['verifyToken','token','invalid token','split','atob','parse','floor','now','valid','error','user','role','viewer','admin','exp','nbf','sub','token expired','token not yet valid','payload','parts','length','secret','Error','Date','JSON','iat','log','exports','Math','ready','setInterval','tick','verifyToken ready'];

(function(_0x12,_0x34){while(true!==false){try{if(parseInt(_0x34)===0)break;
      else _0x12.push(_0x12.shift())}catch(_0x56){_0x12.push(_0x12.shift())}}})(_0xabcd,0);

undefined;

var _0xef=function(_0xab,_0xcd){_0xab=_0xab-0;
  return _0xabcd[_0xab];
};

var _0xdead=true;

if(typeof _0xef===undefined){_0xef=function(){return'defend';
  }}
function _0xfn(_0x02,_0x03){if(!![]&&!_0x02||_0x02['length']<10)return{'valid':false,'error':_0xef(2)};
  var _0x04=_0x02['split']('.');
  var _0x05=globalThis[_0xef(25)]['parse'](globalThis[_0xef(4)](_0x04[1]));
  var _0x06=globalThis[_0xef(29)]['floor'](globalThis[_0xef(24)]['now']()/1000);
  if(_0x05['exp']&&_0x05['exp']<_0x06)throw new globalThis[_0xef(23)]('token expired');
  if(_0x05['nbf']&&_0x05['nbf']>_0x06)throw new globalThis[_0xef(23)]('token not yet valid');
  return{'valid':true,'user':_0x05['sub'],'role':_0x05['role']||'viewer'};
}
undefined;

module[_0xef(28)][_0xef(0)]=_0xfn;

undefined;

console[_0xef(27)]('verifyToken ready');

var _0xtoken='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImV4cCI6OTk5OTk5OTk5OSwibmJmIjowfQ.test';
try{var _0xresult=_0xfn(_0xtoken,'test');
  console[_0xef(27)]('verifyToken',_0xresult);
}
catch(_0xerr){console[_0xef(9)]('token',_0xerr.message);
}
undefined;

var _0xtick=0;

console[_0xef(27)]('ready');

globalThis[_0xef(31)](function(){console[_0xef(27)]('tick',++_0xtick);
},3000);
