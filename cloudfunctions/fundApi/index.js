const https = require('https');

exports.main = async (event) => {
  const { type, code } = event;
  if (!type) return { error: 'Missing type' };
  var noCodeTypes = ['indices', 'sectors', 'rank'];
  if (!code && noCodeTypes.indexOf(type) < 0) return { error: 'Missing code' };

  let url, opts = {};

  if (type === 'search') {
    url = 'https://searchapi.eastmoney.com/api/suggest/get?input=' + encodeURIComponent(code) + '&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=' + (event.count || 20);
  } else if (type === 'nav') {
    url = 'https://api.fund.eastmoney.com/f10/lsjz?fundCode=' + encodeURIComponent(code) + '&pageIndex=1&pageSize=1';
  } else if (type === 'history') {
    var ps = event.pageSize || 20, pi = event.pageIndex || 1;
    var sd = event.startDate || '', ed = event.endDate || '';
    url = 'https://api.fund.eastmoney.com/f10/lsjz?fundCode=' + encodeURIComponent(code) + '&pageIndex=' + pi + '&pageSize=' + ps + (sd ? '&sdate=' + sd : '') + (ed ? '&edate=' + ed : '');
  } else if (type === 'benchmark') {
    var bsd = event.startDate || '';
    var bed = event.endDate || '';
    url = 'https://api.fund.eastmoney.com/f10/lsjz?fundCode=160706&pageIndex=1&pageSize=250' + (bsd ? '&sdate=' + bsd : '') + (bed ? '&edate=' + bed : '');
  } else if (type === 'holdings') {
    url = 'https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=' + encodeURIComponent(code) + '&topline=10&year=&month=&rt=' + Date.now();
  } else if (type === 'stocknews') {
    var cn = code.replace(/[^0-9]/g, '');
    var ex = /^60[0-3]/.test(cn) || /^68/.test(cn) ? 'SHA' : 'SZA';
    if (/^0\d{4}$/.test(cn)) {
      url = 'https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel,hk-stock-channel,a-stock-channel&client=pc&limit=50&first_page=true';
      opts.isWscnFallback = true; opts.stockName = event.stockName || '';
    } else {
      url = 'https://np-anotice-stock.eastmoney.com/api/security/ann?page_size=10&page_index=1&ann_type=' + ex + '&stock_list=' + cn;
    }
    opts.timeout = 8000;
        } else if (type === 'indices') {
    // Sina hq.sinajs.cn API，响应为 GBK 编码，需用 TextDecoder 解码
    return new Promise(function(resolve) {
      var snUrl = 'https://hq.sinajs.cn/list=sh000001,sz399001,sz399006,sh000688';
      var sp = new URL(snUrl);
      https.request({
        hostname: sp.hostname, path: sp.pathname + sp.search, method: 'GET', timeout: 8000,
        headers: { 'Referer': 'https://finance.sina.com.cn/' }
      }, function(incoming) {
        var chunks = [];
        incoming.on('data', function(c) { chunks.push(c); });
        incoming.on('end', function() {
          var buf = Buffer.concat(chunks);
          var body;
          try { body = new TextDecoder('gbk').decode(buf); }
          catch(e) { body = buf.toString(); }
          var lines = body.split('\n').filter(Boolean);
          var indices = [];
          lines.forEach(function(line) {
            var m = line.match(/"([^"]*)"/);
            if (!m) return;
            var parts = m[1].split(',');
            if (parts.length < 4) return;
            var name = parts[0];
            var prevClose = parseFloat(parts[2]) || 0;
            var price = parseFloat(parts[3]) || 0;
            var change = price - prevClose;
            var changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
            var codeMatch = line.match(/hq_str_(?:sh|sz)(\d+)/);
            var code = codeMatch ? codeMatch[1] : '';
            indices.push({ code: code, name: name, price: price, changePct: parseFloat(changePct.toFixed(2)), change: parseFloat(change.toFixed(2)) });
          });
          console.log('sina indices:', indices.length);
          resolve({ indices: indices });
        });
      }).on('error', function(e) { resolve({ indices: [] }); }).end();
    });
  } else if (type === 'sectors') {
    return fetchJSON('https://push2delay.eastmoney.com/api/qt/clist/get?fid=f3&po=1&pz=20&pn=1&np=1&fltt=2&invt=2&fs=m:90+t:2&fields=f2,f3,f4,f12,f14').then(function(data) {
      var list = (data && data.data && data.data.diff) || [];
      return { sectors: list.map(function(item) {
        return { code: item.f12, name: item.f14, changePct: item.f3, change: item.f4, price: item.f2 };
      }) };
    });
  } else if (type === 'rank') {
    var ft = event.ft || 'all';
    var sc = event.sc || '1nzf';
    var st = event.st || 'desc';
    var pi = event.pi || 1;
    var pn = event.pn || 30;
    url = 'https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=' + ft +
      '&rs=&gs=0&sc=' + sc + '&st=' + st +
      '&sd=' + (event.sd || '') + '&ed=' + (event.ed || '') +
      '&qdii=&tabSubtype=,,,,,&pi=' + pi + '&pn=' + pn + '&dx=1&v=' + Date.now();
  } else {
    return { error: 'Unknown type: ' + type };
  }

  return fetchURL(url, opts).then(function(body) {
    if (type === 'history' || type === 'benchmark') {
      try { var d1 = JSON.parse(body); return { list: (d1.Data && d1.Data.LSJZList) || [], total: d1.TotalCount || 0 }; }
      catch(e) { return { error: e.message, list: [] }; }
    }
    try {
      if (type === 'rank') return parseRank(body);
      if (type === 'holdings') return parseHoldings(body);
      if (type === 'stocknews') {
        var d3 = JSON.parse(body);
        return opts.isWscnFallback ? parseWscnNews(d3, opts.stockName) : parseStockNews(d3);
      }
      return JSON.parse(body);
    } catch(e) { return { error: e.message }; }
  });
};

function fetchURL(url, opts) {
  opts = opts || {};
  return new Promise(function(resolve) {
    var p = new URL(url);
    var req = https.request({
      hostname: p.hostname, path: p.pathname + p.search, method: 'GET',
      timeout: opts.timeout || 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://fund.eastmoney.com/', 'Accept': 'application/json' }
    }, function(incoming) {
      var body = '';
      incoming.setEncoding('utf8');
      incoming.on('data', function(c) { body += c; });
      incoming.on('end', function() { resolve(body); });
    });
    req.setTimeout(opts.timeout || 10000, function() { req.destroy(); resolve({ error: 'timeout' }); });
    req.on('error', function(e) { resolve({ error: e.message }); });
    req.end();
  });
}

function fetchJSON(url) {
  return fetchURL(url).then(function(body) {
    if (typeof body === 'object') { console.error('fetchJSON non-string:', JSON.stringify(body)); return body; }
    try { return JSON.parse(body); } catch(e) { console.error('fetchJSON parse error:', e.message); return { error: e.message }; }
  });
}

function parseHoldings(body) {
  var cS = body.indexOf('content:"'), cE = body.indexOf('",arryear');
  if (cE < 0) cE = body.indexOf('",curyear');
  var content = (cS >= 0 && cE > cS) ? body.substring(cS + 9, cE) : '';
  var source = 'content-pattern';
  if (!content) {
    try { var j = JSON.parse(body); content = (j.Data && typeof j.Data === 'string') ? j.Data : (j.content || ''); } catch(e) {}
    if (content) source = 'json-parse';
  }
  if (!content) {
    var tb = body.indexOf('<tbody>');
    if (tb >= 0) { var te = body.indexOf('</tbody>', tb); if (te > tb) content = body.substring(tb, te + 8); }
    if (content) source = 'tbody-fallback';
  }
  if (!content) {
    var cy = (body.match(/curyear["\s:=]+(\d{4})/) || [''])[1];
    return { sectors: [], stocks: [], date: cy || '' };
  }

  var yr = (body.match(/curyear["\s:=]+(\d{4})/) || body.match(/year["\s:=]+(\d{4})/) || [''])[1] || '';

  var sectors = [];
  var seg = content.match(/持股变动明细([\s\S]*?)show/);
  if (seg) { var tags = seg[0].match(/\>([^<>\d]{2,8})\</g); if (tags) tags.forEach(function(t) { var n = t.replace(/[><]/g,'').trim(); if (n && sectors.indexOf(n) < 0 && !/^[\d\s.，,]+$/.test(n)) sectors.push(n); }); }
  if (!sectors.length) {
    var br = /<a[^>]*href="[^"]*BK\d+[^"]*"[^>]*>([^<]{2,8})<\/a>/gi, bm;
    while ((bm = br.exec(content)) !== null) { var n = bm[1].trim(); if (n && sectors.indexOf(n) < 0 && sectors.length < 10) sectors.push(n); }
  }
  if (!sectors.length) {
    var kw = ['中证','国证','上证','深证','科创','创业','沪深300','中证500','中证1000','白酒','医药','医疗','军工','新能源','光伏','半导体','芯片','消费','科技','金融','地产','银行','证券','保险','汽车','农业','传媒','游戏','动漫','AI','人工智能','红利','黄金','有色','钢铁','煤炭','电力','环保','基建','一带一路','国企','央企','高股息','纳指','标普','恒生','港股'];
    var ar = /<a[^>]*>([^<]+)<\/a>/g, am;
    while ((am = ar.exec(content)) !== null) {
      var t = am[1].trim();
      if (t.length >= 4 && (t.indexOf('基金')>=0 || t.indexOf('ETF')>=0 || /\d{6}/.test(t))) {
        for (var i = 0; i < kw.length; i++) { if (t.indexOf(kw[i]) >= 0 && sectors.indexOf(kw[i]) < 0 && sectors.length < 8) sectors.push(kw[i]); }
        break;
      }
    }
  }

  var stocks = [];
  var tm = content.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (tm) {
    tm[1].split('</tr>').forEach(function(row) {
      var td = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
      if (!td || td.length < 5) return;
      var cells = td.map(function(c) { return c.replace(/<[^>]+>/g,'').trim(); });
      var sc = (cells[1]||'').replace(/[^\d]/g,''), sn = (cells[2]||'').replace(/\s+/g,'');
      var w = parseFloat((cells[cells.length-3]||'').replace('%','')) || 0;
      if (sc && sn && w > 0 && stocks.length < 10) stocks.push({ code: sc, name: sn, weight: w });
    });
  }
  if (!stocks.length) return { sectors: sectors, stocks: stocks, date: yr, _source: source };
  return { sectors: sectors, stocks: stocks, date: yr };
}

function parseStockNews(data) {
  var list = (data && data.data && data.data.list) || [], now = new Date(), news = [];
  list.forEach(function(item) {
    var m = (item.display_time||'').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return;
    var t = new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]), h = (now-t)/36e5;
    if (h < 0 || h > 168) return;
    news.push({ title: item.title_ch||item.title||'', column: (item.columns&&item.columns[0])?item.columns[0].column_name:'', time: item.display_time||'', date: item.notice_date||'' });
  });
  if (!news.length && list.length) {
    for (var i = 0; i < Math.min(2,list.length); i++) news.push({ title: list[i].title_ch||list[i].title||'', column: '', time: list[i].display_time||'', date: list[i].notice_date||'', stale: true });
  }
  return { news: news, total: list.length };
}

function parseWscnNews(data, stockName) {
  var items = (data&&data.data&&data.data.items)||[], now = new Date(), news = [];
  var kw = (function(n) {
    if (!n) return [''];
    var m = { '腾讯控股':['腾讯'],'阿里巴巴':['阿里巴巴'],'百胜中国':['百胜'],'中国海洋石油':['中海油'],'中芯国际':['中芯国际'],'京东健康':['京东'],'贵州茅台':['茅台'],'五粮液':['五粮液'],'泸州老窖':['泸州老窖'],'山西汾酒':['汾酒'],'东山精密':['东山精密'],'美的集团':['美的'],'海康威视':['海康威视'],'恒瑞医药':['恒瑞医药'],'宁德时代':['宁德时代'],'立讯精密':['立讯精密'],'隆基绿能':['隆基绿能'],'东方财富':['东方财富'],'招商银行':['招商银行'],'兴业银行':['兴业银行'] };
    return m[n] || [n.substring(0,Math.min(4,n.length))];
  })(stockName);
  items.forEach(function(item) {
    var t = item.content_text||''; if (!t) return;
    if (!kw.some(function(k) { return t.indexOf(k)>=0; })) return;
    var d = new Date((item.display_time||0)*1000), h = (now-d)/36e5; if (h<0||h>168) return;
    var ds = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');
    news.push({ title: t.length>100?t.substring(0,100)+'...':t, column:'市场快讯', time:ds, date:ds.substring(0,10), source:'wscn' });
  });
  return { news: news, total: items.length, source: 'wscn' };
}

function parseRank(body) {
  if (!body) return { error: 'empty body' };
  try {
    var start = body.indexOf('{');
    var end = body.lastIndexOf('}');
    if (start < 0 || end < start) return { error: 'parse fail' };
    var jsonStr = body.substring(start, end + 1);
    // rankhandler returns JS object literal with unquoted keys
    // e.g. {datas:[...],allPages:5} -> valid JSON
    jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3');
    var data = JSON.parse(jsonStr);
    if (data.ErrCode && data.ErrCode !== 0) {
      return { error: data.Data || ('rank err ' + data.ErrCode) };
    }
    return {
      datas: data.datas || [],
      allPages: data.allPages || 1,
      allNum: data.allNum || 0
    };
  } catch (e) {
    return { error: e.message };
  }
}
