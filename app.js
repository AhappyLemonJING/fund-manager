App({
  globalData: {
    funds: [],
    groups: [],
    groupMap: {}  // { fundCode: groupId }
  },

  onLaunch: function() {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-d7gomttjdaf011279',
        traceUser: true
      });
    }
  },


  // ============ 云同步 ============

  _loadSyncMeta: function() {
    try { return wx.getStorageSync('_sync_meta') || {}; } catch (e) { return {}; }
  },

  _saveSyncMeta: function(meta) {
    wx.setStorageSync('_sync_meta', meta);
  },

  _touch: function(category) {
    var meta = this._loadSyncMeta();
    var now = Date.now();
    var last = meta._seq || 0;
    if (now <= last) now = last + 1;
    meta._seq = now;
    meta[category] = now;
    this._saveSyncMeta(meta);
    return now;
  },

  getLastSyncTime: function() {
    var meta = this._loadSyncMeta();
    return meta._lastSync || 0;
  },

  _markSynced: function() {
    var meta = this._loadSyncMeta();
    meta._lastSync = Date.now();
    this._saveSyncMeta(meta);
  },

  prepareSyncData: function() {
    var meta = this._loadSyncMeta();
    var now = Date.now();
    var codes = this.loadCodes();
    var types = this.loadFundTypes();
    var fundList = [];
    for (var i = 0; i < codes.length; i++) {
      var c = codes[i];
      fundList.push({ code: c, type: types[c] || 'watch', updatedAt: meta.fundTypes || meta.fundCodes || now });
    }
    var rawGroups = this.loadGroups();
    var groups = [];
    for (var j = 0; j < rawGroups.length; j++) {
      groups.push({ groupId: rawGroups[j].id, name: rawGroups[j].name, updatedAt: meta.groups || now });
    }
    var rawMap = this.loadGroupMap();
    var groupMap = [];
    var mk = Object.keys(rawMap);
    for (var k = 0; k < mk.length; k++) groupMap.push({ fundCode: mk[k], groupId: rawMap[mk[k]], updatedAt: meta.groupMap || now });
    var allTrades = {};
    try { allTrades = wx.getStorageSync('fund_trades') || {}; } catch (e) {}
    var trades = [];
    var tk = Object.keys(allTrades);
    for (var t = 0; t < tk.length; t++) {
      var list = allTrades[tk[t]] || [];
      for (var u = 0; u < list.length; u++) { var tr = list[u]; tr.tradeId = tr.id; delete tr.id; tr.fundCode = tk[t]; tr.updatedAt = meta.trades || now; trades.push(tr); }
    }
    var rawOv = this.loadPositionOverrides();
    var overrides = [];
    var ok = Object.keys(rawOv);
    for (var o = 0; o < ok.length; o++) {
      var ov = rawOv[ok[o]];
      if (ov) overrides.push({ fundCode: ok[o], marketValue: ov.marketValue, profit: ov.profit, holdingDays: ov.holdingDays, updatedAt: meta.overrides || now });
    }
    console.log('prepareSyncData groups sample:', groups.length > 0 ? JSON.stringify(groups[0]) : 'empty');
    return { fundList: fundList, groups: groups, groupMap: groupMap, trades: trades, overrides: overrides };
  },

  applySyncData: function(data) {
    var fl = data.fundList || [];
    var codes = [], types = {};
    for (var i = 0; i < fl.length; i++) { codes.push(fl[i].code); types[fl[i].code] = fl[i].type || 'watch'; }
    this.saveCodes(codes);
    this.saveFundTypes(types);
    var gl = data.groups || [];
    var cg = [];
    for (var j = 0; j < gl.length; j++) cg.push({ id: gl[j].groupId || gl[j].id, name: gl[j].name });
    this.saveGroups(cg);
    var gml = data.groupMap || [];
    var gm = {};
    for (var k = 0; k < gml.length; k++) gm[gml[k].fundCode] = gml[k].groupId;
    this.saveGroupMap(gm);
    var tl = data.trades || [];
    var tbc = {};
    for (var t = 0; t < tl.length; t++) {
      var tr = tl[t], fc = tr.fundCode;
      if (!tbc[fc]) tbc[fc] = [];
      tbc[fc].push({ id: tr.tradeId || tr.id, date: tr.date, type: tr.type, shares: tr.shares, amount: tr.amount, nav: tr.nav, isBefore3pm: tr.isBefore3pm });
    }
    wx.setStorageSync('fund_trades', tbc);
    var ol = data.overrides || [];
    var om = {};
    for (var o = 0; o < ol.length; o++) { var ov = ol[o]; om[ov.fundCode] = { marketValue: ov.marketValue, profit: ov.profit, holdingDays: ov.holdingDays }; }
    this.savePositionOverrides(om);
    this._markSynced();
  },

  syncData: function() {
    var self = this;
    var data = self.prepareSyncData();
    return wx.cloud.callFunction({ name: 'sync', data: { data: data } }).then(function(res) {
      if (res.result && res.result.success) { self.applySyncData(res.result.data); return { ok: true, time: new Date() }; }
      var errs = (res.result && res.result.errors) || [];
      return { ok: false, error: errs.length > 0 ? errs.join('; ') : '同步返回异常' };
    }).catch(function(err) { return { ok: false, error: err.message || 'u7f51u7edcu9519u8bef' }; });
  },

  // ============ 基金代码存储 ============

  loadCodes: function() {
    try { return wx.getStorageSync('fund_codes') || []; } catch (e) { return []; }
  },

  saveCodes: function(codes) {
    wx.setStorageSync('fund_codes', codes);
    this._touch('fundCodes');
  },

  // ============ 分组存储 ============

  loadGroups: function() {
    try {
      var groups = wx.getStorageSync('fund_groups') || [];
      var fixed = false;
      for (var i = 0; i < groups.length; i++) {
        if (!groups[i].id) {
          groups[i].id = 'g_' + Date.now() + '_' + i;
          fixed = true;
        }
      }
      if (fixed) { wx.setStorageSync('fund_groups', groups); }
      return groups;
    } catch (e) { return []; }
  },

  saveGroups: function(groups) {
    wx.setStorageSync('fund_groups', groups);
    this._touch('groups');
    this.globalData.groups = groups;
  },

  loadGroupMap: function() {
    try { return wx.getStorageSync('fund_group_map') || {}; } catch (e) { return {}; }
  },

  saveGroupMap: function(map) {
    wx.setStorageSync('fund_group_map', map);
    this._touch('groupMap');
    this.globalData.groupMap = map;
  },

  addGroup: function(name) {
    var groups = this.globalData.groups;
    var id = 'g_' + Date.now();
    groups.push({ id: id, name: name });
    this.saveGroups(groups);
    return id;
  },

  renameGroup: function(groupId, newName) {
    var groups = this.globalData.groups;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].id === groupId) { groups[i].name = newName; break; }
    }
    this.saveGroups(groups);
  },

  deleteGroup: function(groupId) {
    var groups = this.globalData.groups;
    var map = this.globalData.groupMap;
    Object.keys(map).forEach(function(code) {
      if (map[code] === groupId) delete map[code];
    });
    this.saveGroupMap(map);
    this.saveGroups(groups.filter(function(g) { return g.id !== groupId; }));
  },

  setFundGroup: function(fundCode, groupId) {
    var map = this.globalData.groupMap;
    if (groupId) {
      map[fundCode] = groupId;
    } else {
      delete map[fundCode];
    }
    this.saveGroupMap(map);
  },

  // ============ 基金类型 (持仓 position / 自选 watch) ============

  loadFundTypes: function() {
    try { return wx.getStorageSync('fund_types') || {}; } catch (e) { return {}; }
  },

  saveFundTypes: function(types) {
    wx.setStorageSync('fund_types', types);
    this._touch('fundTypes');
  },

  setFundType: function(fundCode, type) {
    var types = this.loadFundTypes();
    types[fundCode] = type;
    this.saveFundTypes(types);
  },

  getFundType: function(fundCode) {
    var types = this.loadFundTypes();
    return types[fundCode] || 'watch';
  },

  // ============ 交易记录 & 盈亏 ============

  loadTrades: function(code) {
    try {
      var all = wx.getStorageSync('fund_trades') || {};
      return all[code] || [];
    } catch (e) { return []; }
  },

  saveTrades: function(code, trades) {
    var all = {};
    try { all = wx.getStorageSync('fund_trades') || {}; } catch (e) {}
    all[code] = trades;
    wx.setStorageSync('fund_trades', all);
    this._touch('trades');
  },

  addTrade: function(code, trade) {
    var trades = this.loadTrades(code);
    trades.push(trade);
    this.saveTrades(code, trades);
    return trades;
  },

  deleteTrade: function(code, index) {
    var trades = this.loadTrades(code);
    trades.splice(index, 1);
    this.saveTrades(code, trades);
    return trades;
  },

  calcProfitLoss: function(code, nav) {
    var trades = this.loadTrades(code);
    var totalShares = 0;
    var totalCost = 0;
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      if (t.type === 'buy') {
        totalShares += t.shares;
        totalCost += t.amount;
      } else if (t.type === 'sell') {
        totalShares -= t.shares;
        totalCost -= t.amount;
      }
    }
    var avgCost = totalShares > 0 ? totalCost / totalShares : 0;
    var marketValue = totalShares * nav;
    var profit = marketValue - totalCost;
    var profitPct = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    return {
      shares: totalShares, cost: totalCost, avgCost: avgCost,
      marketValue: marketValue, profit: profit, profitPct: profitPct,
      holdingDays: this.calcHoldingDays(code)
    };
  },

  calcHoldingDays: function(code) {
    var trades = this.loadTrades(code);
    if (trades.length === 0) return 0;
    var earliestEffective = null;
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      if (t.type !== 'buy') continue;
      var parts = t.date.split('-');
      var buyDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      var offset = (t.isBefore3pm !== false) ? 1 : 2;
      var effective = new Date(buyDate.getTime() + offset * 86400000);
      if (!earliestEffective || effective < earliestEffective) {
        earliestEffective = effective;
      }
    }
    if (!earliestEffective) return 0;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    earliestEffective.setHours(0, 0, 0, 0);
    var diff = Math.floor((today.getTime() - earliestEffective.getTime()) / 86400000);
    return Math.max(0, diff);
  },

  // ============ 持仓金额/收益/天数 手动覆盖 ============

  loadPositionOverrides: function() {
    try { return wx.getStorageSync('position_overrides') || {}; } catch (e) { return {}; }
  },

  savePositionOverrides: function(overrides) {
    wx.setStorageSync('position_overrides', overrides);
    this._touch('overrides');
  },

  getPosOverride: function(code) {
    var all = this.loadPositionOverrides();
    return all[code] || null;
  },

  setPosOverride: function(code, override) {
    var all = this.loadPositionOverrides();
    if (!override) {
      delete all[code];
    } else {
      all[code] = override;
    }
    this.savePositionOverrides(all);
  },

  applyPosOverrides: function(code, nav, pl) {
    var ov = this.getPosOverride(code);
    if (!ov) return pl;
    var marketValue = ov.marketValue;
    var profit = ov.profit;
    var cost = marketValue - profit;
    var profitPct = cost > 0 ? (profit / cost) * 100 : 0;
    var avgCost = nav > 0 ? cost / (marketValue / nav) : 0;
    if (isNaN(avgCost) || !isFinite(avgCost)) avgCost = 0;
    return {
      shares: nav > 0 ? marketValue / nav : pl.shares,
      cost: cost,
      avgCost: avgCost,
      marketValue: marketValue,
      profit: profit,
      profitPct: profitPct,
      override: true,
      holdingDays: ov.holdingDays || 0
    };
  },

  // ============ 聚合全部持仓总览 ============

  calcPortfolio: function(funds) {
    var totalCost = 0;
    var totalMarket = 0;
    var list = [];
    for (var i = 0; i < funds.length; i++) {
      var f = funds[i];
      var type = this.getFundType(f.code);
      if (type !== 'position') continue;
      var nav = parseFloat(f.nav) || 0;
      if (nav <= 0) continue;
      var pl = this.calcProfitLoss(f.code, nav);
      pl = this.applyPosOverrides(f.code, nav, pl);
      if (pl.shares <= 0) continue;
      totalCost += pl.cost;
      totalMarket += pl.marketValue;
      list.push({ code: f.code, name: f.name, nav: nav, pl: pl });
    }
    var totalProfit = totalMarket - totalCost;
    var totalPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
    return { totalCost: totalCost, totalMarket: totalMarket, totalProfit: totalProfit,
      totalPct: totalPct, items: list };
  },

  // ============ API ============

  callApi: function(type, code, params) {
    var data = { type: type, code: code };
    if (params) {
      Object.keys(params).forEach(function(k) { data[k] = params[k]; });
    }
    return wx.cloud.callFunction({
      name: 'fundApi',
      data: data
    }).then(function(res) { return res.result; });
  },

  searchFund: function(code) {
    return this.callApi('search', code).then(function(data) {
      var items = (data.QuotationCodeTable && data.QuotationCodeTable.Data) || [];
      var fundItems = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].Classify === 'OTCFUND' || items[i].SecurityTypeName === '基金') {
          fundItems.push(items[i]);
        }
      }
      if (fundItems.length > 0) {
        return { code: code, name: fundItems[0].Name, quoteId: fundItems[0].QuoteID };
      }
      return null;
    });
  },

  fetchNav: function(code) {
    return this.callApi('nav', code).then(function(data) {
      var list = (data.Data && data.Data.LSJZList) || [];
      if (list.length > 0) {
        return {
          nav: parseFloat(list[0].DWJZ),
          changePct: parseFloat(list[0].JZZZL),
          date: list[0].FSRQ
        };
      }
      return null;
    });
  },

  // 拉取历史净值 (多页)
  fetchHistory: function(code, days) {
    var self = this;
    var all = [];
    var pageSize = 20;
    var pages = Math.ceil(days / pageSize);
    var endDate = new Date();
    var startDate = new Date(endDate.getTime() - days * 86400000);
    var sd = startDate.getFullYear() + '-' +
      String(startDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(startDate.getDate()).padStart(2, '0');
    var ed = endDate.getFullYear() + '-' +
      String(endDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(endDate.getDate()).padStart(2, '0');

    function fetchPage(page) {
      return self.callApi('history', code, {
        pageIndex: page, pageSize: pageSize,
        startDate: sd, endDate: ed
      }).then(function(data) {
        if (data.list && data.list.length > 0) {
          all = all.concat(data.list);
        }
        if (page < pages && data.list && data.list.length === pageSize) {
          return fetchPage(page + 1);
        }
        return all;
      });
    }
    return fetchPage(1).then(function(list) {
      // 反转按日期升序，取最近 days 条
      list.reverse();
      if (list.length > days) list = list.slice(list.length - days);
      return list.map(function(item) {
        return {
          date: item.FSRQ,
          nav: parseFloat(item.DWJZ),
          changePct: parseFloat(item.JZZZL) || 0
        };
      });
    });
  },

  // 拉取沪深300基准
  fetchBenchmark: function(days) {
    var endDate = new Date();
    var startDate = new Date(endDate.getTime() - days * 86400000);
    var sd = startDate.getFullYear() + '-' +
      String(startDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(startDate.getDate()).padStart(2, '0');
    var ed = endDate.getFullYear() + '-' +
      String(endDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(endDate.getDate()).padStart(2, '0');
    return this.callApi('history', '160706', { pageIndex: 1, pageSize: 20, startDate: sd, endDate: ed })
      .then(function(data) {
        var list = (data.Data && data.Data.LSJZList) || (data.list || []);
        list.reverse();
        if (list.length > days) list = list.slice(list.length - days);
        return list.map(function(item) {
          return {
            date: item.FSRQ,
            nav: parseFloat(item.DWJZ)
          };
        });
      });
  },

  // ============ 持仓 & 新闻 & 分析 ============

  fetchHoldings: function(code) {
    return this.callApi('holdings', code).then(function(data) {
      return data;
    });
  },

  fetchStockNews: function(code, stockName) {
    var self = this;
    return wx.cloud.callFunction({
      name: 'fundApi',
      data: { type: 'stocknews', code: code, stockName: stockName || '' }
    }).then(function(res) {
      var data = res.result;
      return data.news || [];
    });
  },

  analyzeNews: function(stocks, newsMap, fundName) {
    var data = { stocks: stocks, newsMap: newsMap };
    if (fundName) data.fundName = fundName;
    return wx.cloud.callFunction({
      name: 'analyze',
      data: data
    }).then(function(res) { return res.result; });
  }
});
