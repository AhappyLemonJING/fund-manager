const https = require('https');

/* 云函数：代理东方财富 API 请求
 * 入参: { type: 'search' | 'nav' | 'holdings' | 'stocknews', code: '000001' }
 */
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
  } else if (type === 'holdings') {
    url = 'https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=' +
      encodeURIComponent(code) + '&topline=10&year=&month=&rt=' + Date.now();
  } else if (type === 'stocknews') {
    var codeNum = code.replace(/[^0-9]/g, '');
    var exchange;
    if (/^60[0-3]/.test(codeNum) || /^68/.test(codeNum)) {
      exchange = 'SHA';
    } else {
      exchange = 'SZA';
    }
    // 港股：公告 API 不覆盖，走 WSCN fallback
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

/* ---- 解析基金持仓 (正则提取，无需 new Function) ---- */
function parseHoldings(body) {
  // 提取 content 字段（位于 content:" 和 ",arryear 之间）
  var cStart = body.indexOf('content:"');
  var cEnd = body.indexOf('",arryear');
  if (cEnd < 0) cEnd = body.indexOf('",curyear');
  if (cStart < 0 || cEnd < cStart) return { error: 'no content field', sectors: [], stocks: [] };
  var content = body.substring(cStart + 9, cEnd);

  // 提取 curyear
  var curYear = '';
  var yrMatch = body.match(/curyear:(\d{4})/);
  if (yrMatch) curYear = yrMatch[1];

  // 解析板块 (从 HTML 的 sector 名称中提取)
  var sectors = [];
  // 尝试从第二个 tbody 的标题区域提取板块信息
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

  // 解析前十大持仓股 (正则提取表格行)
  var stocks = [];
  var tbodyMatch = content.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (tbodyMatch) {
    var rows = tbodyMatch[1].split('</tr>');
    rows.forEach(function(row) {
      var tdMatches = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
      if (!tdMatches || tdMatches.length < 5) return;

      var cells = tdMatches.map(function(td) {
        return td.replace(/<[^>]+>/g, '').trim();
      });

      var codeCell = cells[1] || '';
      var stockCode = codeCell.replace(/[^\d]/g, '');
      var stockName = (cells[2] || '').replace(/\s+/g, '');
      // 权重在倒数第3列
      var weightStr = (cells[cells.length - 3] || '').replace('%', '').trim();
      var weight = parseFloat(weightStr) || 0;

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
    // 保留7天内的公告
    if (diffHours < 0 || diffHours > 168) return;

    var column = '';
    if (item.columns && item.columns.length > 0) {
      column = item.columns[0].column_name || '';
    }

    var codes = (item.codes || []).map(function(c) { return c.stock_code; });

    news.push({
      title: item.title_ch || item.title || '',
      column: column,
      codes: codes,
      time: displayTime,
      date: item.notice_date || ''
    });
  });

  // Fallback: 如果7天内没有任何公告，返回最新的2条
  if (news.length === 0 && list.length > 0) {
    for (var i = 0; i < Math.min(2, list.length); i++) {
      var item = list[i];
      news.push({
        title: item.title_ch || item.title || '',
        column: (item.columns && item.columns[0]) ? item.columns[0].column_name : '',
        codes: (item.codes || []).map(function(c) { return c.stock_code; }),
        time: item.display_time || '',
        date: item.notice_date || '',
        stale: true
      });
    }
    return { news: news, total: list.length, filtered: 0, fallback: true };
  }

  return { news: news, total: list.length, filtered: news.length };
}
/* ---- 港股 WSCN 快讯关键词匹配 ---- */
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
    // 保留7天内的快讯
    if (diffHours < 0 || diffHours > 168) return;
    
    var timeStr = pubTime.getFullYear() + '-' +
      String(pubTime.getMonth() + 1).padStart(2, '0') + '-' +
      String(pubTime.getDate()).padStart(2, '0') + ' ' +
      String(pubTime.getHours()).padStart(2, '0') + ':' +
      String(pubTime.getMinutes()).padStart(2, '0') + ':' +
      String(pubTime.getSeconds()).padStart(2, '0');
    
    news.push({
      title: text.length > 100 ? text.substring(0, 100) + '...' : text,
      column: '市场快讯',
      codes: [],
      time: timeStr,
      date: timeStr.substring(0, 10),
      source: 'wscn'
    });
  });
  
  return { news: news, total: items.length, filtered: news.length, source: 'wscn' };
}

/* ---- 股票简称 -> 搜索关键词映射 ---- */
function getStockKeywords(name) {
  if (!name) return [''];
  var map = {
    '腾讯控股': ['腾讯'],
    '阿里巴巴': ['阿里巴巴'],
    '百胜中国': ['百胜中国', '百胜'],
    '中国海洋石油': ['中国海洋石油', '中海油'],
    '中芯国际': ['中芯国际'],
    '京东健康': ['京东健康', '京东'],
    '贵州茅台': ['贵州茅台', '茅台'],
    '五粮液': ['五粮液'],
    '泸州老窖': ['泸州老窖'],
    '山西汾酒': ['山西汾酒', '汾酒'],
    '东山精密': ['东山精密'],
    '美的集团': ['美的集团', '美的'],
    '海康威视': ['海康威视'],
    '恒瑞医药': ['恒瑞医药'],
    '宁德时代': ['宁德时代'],
    '立讯精密': ['立讯精密'],
    '隆基绿能': ['隆基绿能'],
    '东方财富': ['东方财富'],
    '招商银行': ['招商银行'],
    '兴业银行': ['兴业银行']
  };
  if (map[name]) return map[name];
  // 通用 fallback: 取名字前2-3个汉字
  return [name.substring(0, Math.min(4, name.length))];
}
