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

  // ============ 基金代码存储 ============

  loadCodes: function() {
    try { return wx.getStorageSync('fund_codes') || []; } catch (e) { return []; }
  },

  saveCodes: function(codes) {
    wx.setStorageSync('fund_codes', codes);
  },

  // ============ 分组存储 ============

  loadGroups: function() {
    try { return wx.getStorageSync('fund_groups') || []; } catch (e) { return []; }
  },

  saveGroups: function(groups) {
    wx.setStorageSync('fund_groups', groups);
    this.globalData.groups = groups;
  },

  loadGroupMap: function() {
    try { return wx.getStorageSync('fund_group_map') || {}; } catch (e) { return {}; }
  },

  saveGroupMap: function(map) {
    wx.setStorageSync('fund_group_map', map);
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

  // ============ API ============

  callApi: function(type, code) {
    return wx.cloud.callFunction({
      name: 'fundApi',
      data: { type: type, code: code }
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

  analyzeNews: function(stocks, newsMap) {
    return wx.cloud.callFunction({
      name: 'analyze',
      data: { stocks: stocks, newsMap: newsMap }
    }).then(function(res) { return res.result; });
  }
});
