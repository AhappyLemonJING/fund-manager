var app = getApp();

Page({
  _timer: null,
  data: {
    funds: [],
    displayFunds: [],
    loading: false,
    activeTab: 'position',  // position | watch
    tabs: [],              // group filter tabs
    activeGroup: 'all',
    groups: [],
    // portfolio summary
    portfolio: null,
    // add modal
    showAddModal: false,
    inputCode: '',
    addGroupId: '',
    addType: 'watch',       // position | watch
    adding: false,
    // group manager
    showGroupModal: false,
    gmEditId: '',
    gmEditName: '',
    newGroupName: '',
    // delete group
    showDelGroupModal: false,
    delGroupId: '',
    delGroupName: '',
    // quick add group from picker
   showQuickGroup: false,
   quickGroupName: '',
    // rename group from tab
    showRenameModal: false,
    renameGroupId: '',
    renameGroupName: '',
    // delete fund
    showDeleteModal: false,
    deleteName: '',
    deleteIndex: -1,
    // move group
    showMoveModal: false,
    moveFundIndex: -1,
    moveTargetGroupId: '',
    // switch type
    showSwitchTypeModal: false,
    switchTypeIndex: -1,
    switchTypeTarget: '',
    // trade modal
    showTradeModal: false,
    tradeFundCode: '',
    tradeFundName: '',
    tradeFundNav: 0,
    tradeRecords: [],
    tradeShares: '',
    tradeAmount: '',
    tradeDate: '',
    tradeType: 'buy',
    tradePl: null,
    // refresh
    refreshing: false
  },

  noop: function() {},

  onLoad: function() {
    var self = this;
    app.globalData.groups = app.loadGroups();
    app.globalData.groupMap = app.loadGroupMap();
    self.buildGroupTabs();

    // 设置默认日期为今天
    var now = new Date();
    self.setData({ tradeDate: now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') });

    var codes = app.loadCodes();
    if (codes.length === 0) return;
    self.setData({ loading: true });
    self.loadFunds(codes);
  },

  onShow: function() {
    this.startAutoRefresh();
    if (app.globalData.funds.length > 0) {
      this.setData({ funds: app.globalData.funds });
      this.applyFilter();
      this.updatePortfolio();
    }
  },

  onHide: function() {
    this.stopAutoRefresh();
  },

  onUnload: function() {
    this.stopAutoRefresh();
  },

  startAutoRefresh: function() {
    var self = this;
    this.doRefreshAll();
    this._timer = setInterval(function() {
      self.doRefreshAll();
    }, 15000);
  },

  stopAutoRefresh: function() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  onRefresh: function() {
    var self = this;
    self.setData({ refreshing: true });
    this.doRefreshAll().then(function() {
      self.setData({ refreshing: false });
    }).catch(function() {
      self.setData({ refreshing: false });
    });
  },

  doRefreshAll: function() {
    var self = this;
    var funds = app.globalData.funds;
    if (funds.length === 0) return Promise.resolve();
    var tasks = funds.map(function(f) {
      return app.fetchNav(f.code).then(function(data) {
        if (data) {
          f.nav = data.nav;
          f.changePct = data.changePct;
          f.date = data.date;
        }
      }).catch(function() {});
    });
    return Promise.all(tasks).then(function() {
      self.setData({ funds: app.globalData.funds });
      self.applyFilter();
      self.updatePortfolio();
    });
  },

  // ============ 分组 Tab ============

  buildGroupTabs: function() {
    var groups = app.globalData.groups;
    var tabs = [{ id: 'all', name: '全部' }, { id: 'ungrouped', name: '未分组' }];
    for (var i = 0; i < groups.length; i++) {
      tabs.push({ id: groups[i].id, name: groups[i].name });
    }
    this.setData({ tabs: tabs, groups: groups });
  },

  // ============ Tab 切换 ============

  switchTab: function(e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ activeTab: id, activeGroup: 'all' });
    this.applyFilter();
    this.updatePortfolio();
  },

  switchGroup: function(e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ activeGroup: id });
    this.applyFilter();
  },

  longPressTab: function(e) {
   var id = e.currentTarget.dataset.id;
    var name = e.currentTarget.dataset.name;
    if (id === 'all' || id === 'ungrouped') return;
    wx.vibrateShort({ type: 'light' });
    var self = this;
    wx.showActionSheet({
      itemList: ['重命名', '删除'],
      itemColor: '#f85149',
      success: function(res) {
        if (res.tapIndex === 0) {
          self.setData({ showRenameModal: true, renameGroupId: id, renameGroupName: name });
        } else if (res.tapIndex === 1) {
          self.setData({ showDelGroupModal: true, delGroupId: id, delGroupName: name });
        }
      }
    });
  },

  // ============ 过滤逻辑 ============

  applyFilter: function() {
    var funds = app.globalData.funds;
    var map = app.globalData.groupMap;
    var type = this.data.activeTab;  // position | watch
    var group = this.data.activeGroup;
    var groups = app.globalData.groups;

    function groupName(code) {
      var gid = map[code];
      if (!gid) return '未分组';
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].id === gid) return groups[i].name;
      }
      return '未分组';
    }

    // 先按类型筛选
    var result = funds.filter(function(f) {
      return app.getFundType(f.code) === type;
    });

    // 再按分组筛选
    if (group === 'ungrouped') {
      result = result.filter(function(f) { return !map[f.code]; });
    } else if (group !== 'all') {
      result = result.filter(function(f) { return map[f.code] === group; });
    }

    // 附加类型和分组名
    result.forEach(function(f) {
      f._groupName = groupName(f.code);
      f._type = app.getFundType(f.code);
    });
    this.setData({ displayFunds: result });
  },

  // ============ 持仓总览 ============

  updatePortfolio: function() {
    var pf = app.calcPortfolio(app.globalData.funds);
    pf.totalMarketStr = pf.totalMarket.toFixed(0);
    pf.totalCostStr = pf.totalCost.toFixed(0);
    var profitSign = pf.totalProfit >= 0 ? '+' : '';
    pf.totalProfitStr = profitSign + pf.totalProfit.toFixed(0);
    pf.totalPctStr = profitSign + pf.totalPct.toFixed(2);
    for (var i = 0; i < pf.items.length; i++) {
      var pi = pf.items[i].pl;
      pi.avgCostStr = pi.avgCost.toFixed(3);
      pi.sharesStr = pi.shares.toFixed(0);
      pi.profitStr = (pi.profit >= 0 ? '+' : '') + pi.profit.toFixed(0);
      pi.profitPctStr = (pi.profitPct >= 0 ? '+' : '') + pi.profitPct.toFixed(2);
    }
    this.setData({ portfolio: pf });
  },
  // ============ 基金加载 ============

  loadFunds: function(codes) {
    var self = this;
    var funds = codes.map(function(code) {
      return { code: code, name: '', nav: null, changePct: 0, date: '', holdings: null, news: null, suggestion: null };
    });
    app.globalData.funds = funds;
    self.setData({ funds: funds });
    self.applyFilter();

    var tasks = funds.map(function(f) { return self.fetchOne(f); });
    Promise.all(tasks).then(function() {
      self.setData({ funds: app.globalData.funds, loading: false });
      self.applyFilter();
      self.updatePortfolio();
    }).catch(function() { self.setData({ loading: false }); });
  },

  fetchOne: function(fund) {
    return app.searchFund(fund.code).then(function(data) {
      if (data && data.name) fund.name = data.name;
      return app.fetchNav(fund.code);
    }).then(function(data) {
      if (data) {
        fund.nav = data.nav.toFixed(4);
        fund.changePct = data.changePct.toFixed(2);
        fund.date = data.date;
      }
    }).catch(function() {
      if (!fund.name) fund.name = '基金' + fund.code;
    });
  },

  // ============ 添加基金 ============

 showAddModal: function() {
   this.setData({ showAddModal: true, inputCode: '', addGroupId: '', addType: 'watch' });
 },
  showAddModal: function() {
    var activeGroup = this.data.activeGroup;
    var defaultGroup = '';
    if (activeGroup !== 'all' && activeGroup !== 'ungrouped') {
      defaultGroup = activeGroup;
    }
    this.setData({ showAddModal: true, inputCode: '', addGroupId: defaultGroup, addType: 'watch' });
  },

  hideAddModal: function() {
    this.setData({ showAddModal: false, adding: false });
  },

  onInputCode: function(e) { this.setData({ inputCode: e.detail.value }); },

  pickGroup: function(e) { this.setData({ addGroupId: e.currentTarget.dataset.id }); },
  pickType: function(e) { this.setData({ addType: e.currentTarget.dataset.id }); },

  showQuickAdd: function() { this.setData({ showQuickGroup: true, quickGroupName: '' }); },
  hideQuickAdd: function() { this.setData({ showQuickGroup: false }); },

  addFund: function() {
    var code = (this.data.inputCode || '').trim();
    if (!/^\d{6}$/.test(code)) { wx.showToast({ title: '请输入6位数字代码', icon: 'none' }); return; }
    if (app.globalData.funds.some(function(f) { return f.code === code; })) {
      wx.showToast({ title: '该基金已在列表中', icon: 'none' }); return;
    }

    var self = this;
    self.setData({ adding: true });
    var groupId = self.data.addGroupId;
    var type = self.data.addType;

    var fund = { code: code, name: '', nav: null, changePct: 0, date: '', holdings: null, news: null, suggestion: null };
    self.fetchOne(fund).then(function() {
      app.globalData.funds.push(fund);
      app.saveCodes(app.globalData.funds.map(function(f) { return f.code; }));
      if (groupId) app.setFundGroup(code, groupId);
      app.setFundType(code, type);
      self.setData({ funds: app.globalData.funds, showAddModal: false, adding: false, inputCode: '' });
      // 切换到对应类型的 tab
      self.setData({ activeTab: type, activeGroup: 'all' });
      self.applyFilter();
      self.updatePortfolio();
      wx.showToast({ title: '添加成功', icon: 'success' });
    }).catch(function() {
      self.setData({ adding: false });
      wx.showToast({ title: '添加失败', icon: 'none' });
    });
  },

  // ============ 切换类型 ============

  showSwitchType: function(e) {
    var idx = e.currentTarget.dataset.index;
    var fund = this.data.displayFunds[idx];
    if (!fund) return;
    this.setData({
      showSwitchTypeModal: true,
      switchTypeIndex: idx,
      switchTypeTarget: app.getFundType(fund.code)
    });
  },

  hideSwitchType: function() { this.setData({ showSwitchTypeModal: false }); },

  confirmSwitchType: function(e) {
    var type = e.currentTarget.dataset.id;
    var idx = this.data.switchTypeIndex;
    var fund = this.data.displayFunds[idx];
    if (!fund) return;
    app.setFundType(fund.code, type);
    this.setData({ showSwitchTypeModal: false });
    this.applyFilter();
    this.updatePortfolio();
    wx.showToast({ title: type === 'position' ? '已移入持仓' : '已移入自选', icon: 'none', duration: 1000 });
  },

  // ============ 交易记录 ============

  showTrade: function(e) {
    var idx = e.currentTarget.dataset.index;
    var fund = this.data.displayFunds[idx];
    if (!fund) return;
    var nav = parseFloat(fund.nav) || 0;
    var trades = app.loadTrades(fund.code);
    var pl = app.calcProfitLoss(fund.code, nav);
    // 格式化展示字符串
    pl.sharesStr = pl.shares.toFixed(2);
    pl.avgCostStr = pl.avgCost.toFixed(4);
    pl.marketValueStr = pl.marketValue.toFixed(2);
    pl.profitStr = (pl.profit >= 0 ? '+' : '') + pl.profit.toFixed(2);
    pl.profitPctStr = (pl.profitPct >= 0 ? '+' : '') + pl.profitPct.toFixed(2);
    // 交易记录格式化
    var fmtTrades = [];
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      fmtTrades.push({
        id: t.id, date: t.date, type: t.type, shares: t.shares,
        amountStr: t.amount.toFixed(0), nav: t.nav
      });
    }
    var now = new Date();
    this.setData({
      showTradeModal: true,
      tradeFundCode: fund.code,
      tradeFundName: fund.name,
      tradeFundNav: nav,
      tradeRecords: fmtTrades,
      tradeShares: '',
      tradeAmount: '',
      tradeType: 'buy',
      tradePl: pl,
      tradeDate: now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0')
    });
  },

  hideTrade: function() { this.setData({ showTradeModal: false }); },

  onTradeShares: function(e) { this.setData({ tradeShares: e.detail.value }); },
  onTradeAmount: function(e) { this.setData({ tradeAmount: e.detail.value }); },
  onTradeDate: function(e) { this.setData({ tradeDate: e.detail.value }); },
  onTradeType: function(e) { this.setData({ tradeType: e.currentTarget.dataset.id }); },

  addTrade: function() {
    var shares = parseFloat(this.data.tradeShares) || 0;
    var amount = parseFloat(this.data.tradeAmount) || 0;
    var date = this.data.tradeDate;
    var type = this.data.tradeType;
    var code = this.data.tradeFundCode;
    var nav = parseFloat(this.data.tradeFundNav) || 0;

    if (shares <= 0) { wx.showToast({ title: '请输入份额', icon: 'none' }); return; }
    if (amount <= 0 && type === 'buy') { wx.showToast({ title: '请输入金额', icon: 'none' }); return; }
    if (!date) { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }

    // 如果没填金额，用当前净值估算
    if (amount <= 0 && nav > 0) {
      amount = shares * nav;
    }

    var trade = {
      date: date,
      type: type,
      shares: shares,
      amount: amount,
      nav: nav,
      id: 't_' + Date.now()
    };

    var trades = app.addTrade(code, trade);
    var pl = app.calcProfitLoss(code, nav);
    pl.sharesStr = pl.shares.toFixed(2);
    pl.avgCostStr = pl.avgCost.toFixed(4);
    pl.marketValueStr = pl.marketValue.toFixed(2);
    pl.profitStr = (pl.profit >= 0 ? '+' : '') + pl.profit.toFixed(2);
    pl.profitPctStr = (pl.profitPct >= 0 ? '+' : '') + pl.profitPct.toFixed(2);
    var fmtTrades = [];
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      fmtTrades.push({
        id: t.id, date: t.date, type: t.type, shares: t.shares,
        amountStr: t.amount.toFixed(0), nav: t.nav
      });
    }

    this.setData({
      tradeRecords: fmtTrades,
      tradePl: pl,
      tradeShares: '',
      tradeAmount: ''
    });
    this.applyFilter();
    this.updatePortfolio();
    wx.showToast({ title: '记录成功', icon: 'success', duration: 1000 });
  },

  deleteTrade: function(e) {
    var idx = e.currentTarget.dataset.index;
    var code = this.data.tradeFundCode;
    var nav = parseFloat(this.data.tradeFundNav) || 0;
    var trades = app.deleteTrade(code, idx);
    var pl = app.calcProfitLoss(code, nav);
    pl.sharesStr = pl.shares.toFixed(2);
    pl.avgCostStr = pl.avgCost.toFixed(4);
    pl.marketValueStr = pl.marketValue.toFixed(2);
    pl.profitStr = (pl.profit >= 0 ? '+' : '') + pl.profit.toFixed(2);
    pl.profitPctStr = (pl.profitPct >= 0 ? '+' : '') + pl.profitPct.toFixed(2);
    var fmtTrades = [];
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      fmtTrades.push({
        id: t.id, date: t.date, type: t.type, shares: t.shares,
        amountStr: t.amount.toFixed(0), nav: t.nav
      });
    }
    this.setData({ tradeRecords: fmtTrades, tradePl: pl });
    this.applyFilter();
    this.updatePortfolio();
  },

  // ============ 移动分组 ============

  showMoveGroup: function(e) {
    var idx = e.currentTarget.dataset.index;
    var fund = this.data.displayFunds[idx];
    var map = app.globalData.groupMap;
    this.setData({
      showMoveModal: true,
      moveFundIndex: idx,
      moveTargetGroupId: map[fund.code] || ''
    });
  },

  hideMoveModal: function() { this.setData({ showMoveModal: false }); },

  moveFundToGroup: function(e) {
    var groupId = e.currentTarget.dataset.id;
    var idx = this.data.moveFundIndex;
    var fund = this.data.displayFunds[idx];
    if (!fund) return;
    app.setFundGroup(fund.code, groupId || null);
    this.setData({ showMoveModal: false });
    this.applyFilter();
    wx.showToast({ title: '已移动', icon: 'none', duration: 1000 });
  },

  // ============ 删除基金 ============

  confirmDelete: function(e) {
    var idx = e.currentTarget.dataset.index;
    var fund = this.data.displayFunds[idx];
    this.setData({ showDeleteModal: true, deleteName: fund.name || fund.code, deleteIndex: idx });
  },
  hideDeleteModal: function() { this.setData({ showDeleteModal: false }); },
  executeDelete: function() {
    var idx = this.data.deleteIndex;
    if (idx < 0) return;
    var fund = this.data.displayFunds[idx];
    app.setFundGroup(fund.code, null);
    // 从 funds 中找到并删除
    var allFunds = app.globalData.funds;
    for (var i = 0; i < allFunds.length; i++) {
      if (allFunds[i].code === fund.code) {
        allFunds.splice(i, 1);
        break;
      }
    }
    app.saveCodes(allFunds.map(function(f) { return f.code; }));
    this.setData({ funds: allFunds, showDeleteModal: false });
    this.applyFilter();
    this.updatePortfolio();
    wx.showToast({ title: '已删除', icon: 'none' });
  },

  // ============ 跳转详情 ============

  goDetail: function(e) {
    var idx = e.currentTarget.dataset.index;
    var fund = this.data.displayFunds[idx];
    if (!fund) return;
    wx.navigateTo({ url: '/pages/detail/detail?code=' + fund.code });
  },

  // ============ 分组管理 ============

  showGroupMgr: function() {
    this.setData({ showGroupModal: true, gmEditId: '', gmEditName: '', newGroupName: '' });
  },
  hideGroupMgr: function() {
    this.setData({ showGroupModal: false });
    this.buildGroupTabs();
    this.applyFilter();
  },
  createGroup: function() {
    var name = (this.data.newGroupName || '').trim();
    if (!name) { wx.showToast({ title: '请输入分组名称', icon: 'none' }); return; }
    app.addGroup(name);
    this.setData({ newGroupName: '', groups: app.globalData.groups });
    this.buildGroupTabs();
  },
  onNewGroupInput: function(e) { this.setData({ newGroupName: e.detail.value }); },

  startRename: function(e) {
    this.setData({ gmEditId: e.currentTarget.dataset.id, gmEditName: e.currentTarget.dataset.name });
  },
  onGmInput: function(e) { this.setData({ gmEditName: e.detail.value }); },
  confirmRename: function(e) {
    var id = e.currentTarget.dataset.id;
    var name = (this.data.gmEditName || '').trim();
    if (name) app.renameGroup(id, name);
    this.setData({ gmEditId: '', gmEditName: '', groups: app.globalData.groups });
    this.buildGroupTabs();
  },
  cancelRename: function() { this.setData({ gmEditId: '', gmEditName: '' }); },

  confirmDelGroup: function(e) {
    this.setData({ showDelGroupModal: true, delGroupId: e.currentTarget.dataset.id, delGroupName: e.currentTarget.dataset.name });
  },
  hideDelGroupModal: function() { this.setData({ showDelGroupModal: false }); },
  executeDelGroup: function() {
    app.deleteGroup(this.data.delGroupId);
    this.setData({ showDelGroupModal: false, groups: app.globalData.groups });
    if (this.data.activeGroup === this.data.delGroupId) {
      this.setData({ activeGroup: 'all' });
    }
    this.buildGroupTabs();
    this.applyFilter();
  },

  // ============ 快捷新建分组 ============

  quickAddGroup: function() { this.setData({ showQuickGroup: true, quickGroupName: '' }); },
  hideQuickGroup: function() { this.setData({ showQuickGroup: false }); },
  onQuickInput: function(e) { this.setData({ quickGroupName: e.detail.value }); },
 confirmQuickGroup: function() {
   var name = (this.data.quickGroupName || '').trim();
   if (!name) { wx.showToast({ title: '请输入分组名称', icon: 'none' }); return; }
   var id = app.addGroup(name);
   this.buildGroupTabs();
   this.setData({ showQuickGroup: false, addGroupId: id, groups: app.globalData.groups });
 },
  // ============ 标签栏重命名分组 ============

  hideRenameModal: function() { this.setData({ showRenameModal: false }); },
  onRenameInput: function(e) { this.setData({ renameGroupName: e.detail.value }); },
  confirmRenameTab: function() {
    var name = (this.data.renameGroupName || '').trim();
    if (!name) { wx.showToast({ title: '请输入分组名称', icon: 'none' }); return; }
    app.renameGroup(this.data.renameGroupId, name);
    this.setData({ showRenameModal: false, groups: app.globalData.groups });
    this.buildGroupTabs();
    this.applyFilter();
    wx.showToast({ title: '已重命名', icon: 'none', duration: 1000 });
  },
});
