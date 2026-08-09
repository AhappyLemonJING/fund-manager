const https = require('https');

exports.main = async (event) => {
  const { type, code } = event;

  if (!type || !code) {
    return { error: 'Missing type or code' };
  }

  let url;
  let opts = {};

  if (type === 'search') {
    url = 'https://searchapi.eastmoney.com/api/suggest/get?input=' +
      encodeURIComponent(code) + '&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=5';
  } else if (type === 'nav') {
    url = 'https://api.fund.eastmoney.com/f10/lsjz?fundCode=' +
      encodeURIComponent(code) + '&pageIndex=1&pageSize=1';
  } else if (type === 'history') {
    var pageSize = event.pageSize || 20;
    var pageIndex = event.pageIndex || 1;
    var endDate = event.endDate || '';
    var startDate = event.startDate || '';
    url = 'https://api.fund.eastmoney.com/f10/lsjz?fundCode=' +
      encodeURIComponent(code) +
      '&pageIndex=' + pageIndex +
      '&pageSize=' + pageSize +
      (startDate ? '&sdate=' + startDate : '') +
      (endDate ? '&edate=' + endDate : '');
  } else if (type === 'benchmark') {
    var sp = event.startDate || '';
    var ep = event.endDate || '';
    url = 'https://api.fund.eastmoney.com/f10/lsjz?fundCode=000300' +
      '&pageIndex=1&pageSize=250' +
      (sp ? '&sdate=' + sp : '') +
      (ep ? '&edate=' + ep : '');
  } else if (type === 'holdings') {
    url = 'https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=' +
      encodeURIComponent(code) + '&topline=10&year=2026&month=&rt=' + Date.now();
  } else if (type === 'stocknews') {
    var codeNum = code.replace(/[^0-9]/g, '');
    var exchange;
    if (/^60[0-3]/.test(codeNum) || /^68/.test(codeNum)) {
      exchange = 'SHA';
    } else {
      exchange = 'SZA';
    }
    if (/^0\d{4}$/.test(codeNum)) {
      url = 'https://api-one.wallstcn.com/apiv1/content/lives' +
        '?channel=global-channel,hk-stock-channel,a-stock-channel&client=pc&limit=50&first_page=true';
      opts.isWscnFallback = true;
      opts.stockName = event.stockName || '';
    } else {
      url = 'https://np-anotice-stock.eastmoney.com/api/security/ann' +
        '?page_size=10&page_index=1&ann_type=' + exchange +
        '&stock_list=' + codeNum;
    }
    opts.timeout = 8000;
  } else {
    return { error: 'Unknown type: ' + type };
  }

  return new Promise((resolve) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: opts.timeout || 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://fund.eastmoney.com/',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (type === 'history') {
          try {
            var data = JSON.parse(body);
            var list = (data.Data && data.Data.LSJZList) || [];
            return resolve({ list: list, total: data.TotalCount || 0, pageIndex: data.PageIndex || 1 });
          } catch (e) {
            resolve({ error: 'parse failed: ' + e.message, list: [] });
          }
          return;
        }
        try {
          if (type === 'holdings') {
            return resolve(parseHoldings(body));
          }
          if (type === 'stocknews') {
            var data = JSON.parse(body);
            if (opts.isWscnFallback) {
              return resolve(parseWscnNews(data, opts.stockName));
            }
            return resolve(parseStockNews(data));
          }
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ error: 'parse failed: ' + e.message });
        }
      });
    });

    req.setTimeout(opts.timeout || 10000, function() {
      req.destroy();
      resolve({ error: 'timeout' });
    });

    req.on('error', (e) => resolve({ error: e.message }));
    req.end();
  });
};

/* ---- 解析基金持仓 ---- */
function parseHoldings(body) {
  var content = '';

  // 先尝试 JSON 解析
  try {
    var json = JSON.parse(body);
    if (json.Data && typeof json.Data === 'string') content = json.Data;
    else if (json.content) content = json.content;
  } catch (e) {}

  // 再从 JS 赋值语句中提取 content 字段
  if (!content) {
    var patterns = [
      /content\s*:\s*"([^"]*)"/,
      /"content"\s*:\s*"([^"]*)"/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = body.match(patterns[i]);
      if (m && m[1]) { content = m[1]; break; }
    }
  }

  // 最后尝试直接找 <tbody>
  if (!content) {
    var tbStart = body.indexOf('<tbody>');
    if (tbStart >= 0) {
      var tbEnd = body.indexOf('</tbody>', tbStart);
      if (tbEnd > tbStart) content = body.substring(tbStart, tbEnd + 8);
    }
  }

  if (!content) return { error: 'no content', sectors: [], stocks: [], _dump: body.substring(0, 300) };

  // 提取年份
  var curYear = '';
  var yrMatch = body.match(/curyear["\s:=]+(\d{4})/) || body.match(/year["\s:=]+(\d{4})/);
  if (yrMatch) curYear = yrMatch[1];

  // 解析板块
  var sectors = [];
  var sectorSeg = content.match(/持股变动明细([\s\S]*?)show/);
  if (sectorSeg) {
    var tags = sectorSeg[0].match(/\>([^<>\d]{2,8})\</g);
    if (tags) {
      tags.forEach(function(t) {
        var name = t.replace(/[><]/g, '').trim();
        if (name && sectors.indexOf(name) === -1 && !/^[\d\s.，,]+$/.test(name)) {
          sectors.push(name);
        }
      });
    }
  }

  // 解析前十大持仓股
  var stocks = [];
  var tbodyMatch = content.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (tbodyMatch) {
    var rows = tbodyMatch[1].split('</tr>');
    rows.forEach(function(row) {
      var tdMatches = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
      if (!tdMatches || tdMatches.length < 5) return;
      var cells = tdMatches.map(function(td) { return td.replace(/<[^>]+>/g, '').trim(); });
      var codeCell = cells[1] || '';
      var stockCode = codeCell.replace(/[^\d]/g, '');
      var stockName = (cells[2] || '').replace(/\s+/g, '');
      var weight = parseFloat((cells[cells.length - 3] || '').replace('%', '')) || 0;
      if (stockCode && stockName && weight > 0 && stocks.length < 10) {
        stocks.push({ code: stockCode, name: stockName, weight: weight });
      }
    });
  }

  return { sectors: sectors, stocks: stocks, date: curYear };
}

/* ---- 解析股票公告新闻 ---- */
function parseStockNews(data) {
  var list = (data && data.data && data.data.list) || [];
  var now = new Date();
  var news = [];
  list.forEach(function(item) {
    var displayTime = item.display_time || '';
    var match = displayTime.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return;
    var pubTime = new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]);
    var diffHours = (now - pubTime) / 36e5;
    if (diffHours < 0 || diffHours > 168) return;
    var column = '';
    if (item.columns && item.columns.length > 0) column = item.columns[0].column_name || '';
    var codes = (item.codes || []).map(function(c) { return c.stock_code; });
    news.push({ title: item.title_ch || item.title || '', column: column, codes: codes, time: displayTime, date: item.notice_date || '' });
  });
  if (news.length === 0 && list.length > 0) {
    for (var i = 0; i < Math.min(2, list.length); i++) {
      var item = list[i];
      news.push({
        title: item.title_ch || item.title || '',
        column: (item.columns && item.columns[0]) ? item.columns[0].column_name : '',
        codes: (item.codes || []).map(function(c) { return c.stock_code; }),
        time: item.display_time || '', date: item.notice_date || '', stale: true
      });
    }
    return { news: news, total: list.length, filtered: 0, fallback: true };
  }
  return { news: news, total: list.length, filtered: news.length };
}

function parseWscnNews(data, stockName) {
  var items = (data && data.data && data.data.items) || [];
  var now = new Date();
  var news = [];
  var keywords = getStockKeywords(stockName);
  items.forEach(function(item) {
    var text = item.content_text || '';
    if (!text) return;
    var matched = false;
    for (var i = 0; i < keywords.length; i++) {
      if (text.indexOf(keywords[i]) >= 0) { matched = true; break; }
    }
    if (!matched) return;
    var pubTime = new Date((item.display_time || 0) * 1000);
    var diffHours = (now - pubTime) / 36e5;
    if (diffHours < 0 || diffHours > 168) return;
    var timeStr = pubTime.getFullYear() + '-' +
      String(pubTime.getMonth() + 1).padStart(2, '0') + '-' +
      String(pubTime.getDate()).padStart(2, '0') + ' ' +
      String(pubTime.getHours()).padStart(2, '0') + ':' +
      String(pubTime.getMinutes()).padStart(2, '0') + ':' +
      String(pubTime.getSeconds()).padStart(2, '0');
    news.push({
      title: text.length > 100 ? text.substring(0, 100) + '...' : text,
      column: '市场快讯', codes: [], time: timeStr, date: timeStr.substring(0, 10), source: 'wscn'
    });
  });
  return { news: news, total: items.length, filtered: news.length, source: 'wscn' };
}

function getStockKeywords(name) {
  if (!name) return [''];
  var map = {
    '腾讯控股': ['腾讯'], '阿里巴巴': ['阿里巴巴'], '百胜中国': ['百胜中国', '百胜'],
    '中国海洋石油': ['中国海洋石油', '中海油'], '中芯国际': ['中芯国际'],
    '京东健康': ['京东健康', '京东'], '贵州茅台': ['贵州茅台', '茅台'],
    '五粮液': ['五粮液'], '泸州老窖': ['泸州老窖'], '山西汾酒': ['山西汾酒', '汾酒'],
    '东山精密': ['东山精密'], '美的集团': ['美的集团', '美的'], '海康威视': ['海康威视'],
    '恒瑞医药': ['恒瑞医药'], '宁德时代': ['宁德时代'], '立讯精密': ['立讯精密'],
    '隆基绿能': ['隆基绿能'], '东方财富': ['东方财富'], '招商银行': ['招商银行'],
    '兴业银行': ['兴业银行']
  };
  if (map[name]) return map[name];
  return [name.substring(0, Math.min(4, name.length))];
}
