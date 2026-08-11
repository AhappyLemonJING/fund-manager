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
    // refresh
    refreshing: false,
    syncing: false,
    lastSyncTime: '',
    showSyncConfirm: false,
  },

  noop: function() {},

  onLoad: function() {
    var self = this;
    app.globalData.groups = app.loadGroups();
    app.globalData.groupMap = app.loadGroupMap();
    self.buildGroupTabs();

    var codes = app.loadCodes();
    if (codes.length === 0) return;
    self.setData({ loading: true });
    self.loadFunds(codes);
  },

  onShow: function() {
    this.startAutoRefresh();
    // 仅在首次打开时完成同步，切换 tab / 切换页面不再重复同步
    if (!app.globalData._synced) this.autoSync();
    else this.setData({ lastSyncTime: app.globalData._lastSyncTime || '' });
   if (app.globalData.funds.length > 0) {
     this.setData({ funds: app.globalData.funds });
     this.applyFilter();
       this.analyzeAllFunds();
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
  },

  switchGroup: function(e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ activeGroup: id });
    this.applyFilter();
  },

    goMarket: function() {
    wx.navigateTo({ url: '/pages/market/market' });
  },

  goDiscover: function() {
    wx.navigateTo({ url: '/pages/discover/discover' });
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
      var sug = f.suggestDaily || f.suggestion;
      if (sug) {
        if (sug.action === 'buy') { f._suggestLabel = '加仓'; f._suggestClass = 'red'; }
        else if (sug.action === 'sell') { f._suggestLabel = '减仓'; f._suggestClass = 'green'; }
        else { f._suggestLabel = '观望'; f._suggestClass = 'blue'; }
      }
    });
    this.setData({ displayFunds: result });
  },

  // ============ 持仓总览 ============

 // ============ 基金加载 ============

  // ============ AI 分析 ============

 analyzeFundIfNeeded: function(fund) {
   var self = this;
   if (fund._holdingsLoaded) return Promise.resolve();
   var code = fund.code;
    var nav = parseFloat(fund.nav) || 0;
   return app.fetchHoldings(code).then(function(data) {
     var stocks = (data && data.stocks) || [];
     fund.holdings = { sectors: (data && data.sectors) || [], stocks: stocks };
     if (stocks.length === 0) {
       fund._holdingsLoaded = true;
       return null;
     }
      // 并行获取净值走势
      var navPromise = app.fetchHistory(code, 132).then(function(histData) {
        if (!histData || histData.length < 2) return null;
        function pctChange(start, end) {
          if (end >= histData.length) return null;
          return ((histData[end].nav - histData[start].nav) / histData[start].nav) * 100;
        }
        var len = histData.length;
        return {
          '1m': pctChange(Math.max(0, len - 22), len - 1),
          '3m': pctChange(Math.max(0, len - 66), len - 1),
          '6m': pctChange(0, len - 1)
        };
      }).catch(function() { return null; });
      return Promise.all(stocks.map(function(s) {
        return app.fetchStockNews(s.code, s.name).then(function(news) {
          return { code: s.code, news: news };
        }).catch(function() { return { code: s.code, news: [] }; });
      }).concat([navPromise])).then(function(results) {
        var newsMap = {};
        var navTrend = null;
        results.forEach(function(r) {
          if (r && r.code) newsMap[r.code] = r.news;
          else if (r && typeof r['1m'] !== 'undefined') navTrend = r;
        });
        fund.news = newsMap;
        var pl = app.calcProfitLoss(code, nav);
        pl = app.applyPosOverrides(code, nav, pl);
        var position = nav > 0 && pl.shares > 0 ? { profitPct: pl.profitPct, holdingDays: pl.holdingDays } : null;
        var dailyPct = parseFloat(fund.changePct) || null;
        return app.analyzeNews(stocks, newsMap, fund.name, navTrend, position, dailyPct);
      });
    }).then(function(result) {
      if (result) {
        fund.suggestion = result.suggest || { action: 'hold', reason: '暂无分析' };
        fund.suggestDaily = result.suggestDaily || null;
        // 将 raw news 标注利好/利空/中性标签
        var labeled = result.labeled || {};
        var rawNews = fund.news || {};
        var mergedMap = {};
        Object.keys(rawNews).forEach(function(code) {
          var newsList = rawNews[code] || [];
          var labels = labeled[code] || [];
          mergedMap[code] = newsList.map(function(n, idx) {
            var label = labels[idx] || { type: 'neutral', reason: '' };
            var timeAgo = '';
            if (n.time) {
              var m = n.time.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
              if (m) {
                var pubTime = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
                var diffH = (new Date() - pubTime) / 36e5;
                if (diffH < 1) timeAgo = Math.round(diffH * 60) + '分钟前';
                else if (diffH < 24) timeAgo = Math.round(diffH) + '小时前';
                else timeAgo = Math.round(diffH / 24) + '天前';
              } else if (n.date) { timeAgo = n.date; }
            }
            return {
              title: n.title || n.text || '', column: n.column || '',
              time: n.time || '', date: n.date || '', stale: n.stale || false,
              timeAgo: timeAgo,
              type: label.type === 'bullish' ? 'bullish' : label.type === 'bearish' ? 'bearish' : 'neutral',
              reason: label.reason || ''
            };
          });
        });
        fund.news = mergedMap;
        fund._aiStats = result.stats || null;
        var aiSectors = result.relatedSectors || [];
        fund._aiSectors = aiSectors;
        fund._aiPowered = result.aiPowered || false;
        // 将 AI 板块合并到关联板块区域
        if (aiSectors.length > 0) {
          var existingSectors = fund.holdings ? (fund.holdings.sectors || []) : [];
          var merged = existingSectors.slice();
          aiSectors.forEach(function(as) {
            if (merged.indexOf(as.name) < 0) merged.push(as.name);
          });
          fund._mergedSectors = merged;
        }
      }
      fund._holdingsLoaded = true;
      self.applyFilter();
    }).catch(function() {
      fund._holdingsLoaded = true;
      self.applyFilter();
    });
  },

  analyzeAllFunds: function() {
    var self = this;
    var funds = app.globalData.funds;
    var positionFunds = funds.filter(function(f) {
      return app.getFundType(f.code) === 'position';
    });
    var tasks = positionFunds.map(function(f) {
      return self.analyzeFundIfNeeded(f);
    });
    return Promise.all(tasks);
  },

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
      self.analyzeAllFunds();
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
      app.pushToCloud();
      self.setData({ funds: app.globalData.funds, showAddModal: false, adding: false, inputCode: '' });
      // 切换到对应类型的 tab
      self.setData({ activeTab: type, activeGroup: 'all' });
     self.applyFilter();
      self.analyzeAllFunds();
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
    app.pushToCloud();
    this.setData({ showSwitchTypeModal: false });
    this.applyFilter();
    wx.showToast({ title: type === 'position' ? '已移入持仓' : '已移入自选', icon: 'none', duration: 1000 });
  },

  // ============ 交易记录 ============

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
  var code = fund.code;
  app.setFundGroup(code, null);
  // 从 funds 中找到并删除
   var allFunds = app.globalData.funds;
   for (var i = 0; i < allFunds.length; i++) {
     if (allFunds[i].code === code) {
       allFunds.splice(i, 1);
       break;
     }
   }
   app.saveCodes(allFunds.map(function(f) { return f.code; }));
   // 清理 fund_types
   var types = app.loadFundTypes();
   delete types[code];
   app.saveFundTypes(types);
   // 清理 position_overrides
   app.setPosOverride(code, null);
   app.pushToCloud();
   this.setData({ funds: allFunds, showDeleteModal: false });
   this.applyFilter();
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
    app.pushToCloud();
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
    app.pushToCloud();
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
   app.pushToCloud();
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
    app.pushToCloud();
    this.setData({ showRenameModal: false, groups: app.globalData.groups });
    this.buildGroupTabs();
    this.applyFilter();
    wx.showToast({ title: '已重命名', icon: 'none', duration: 1000 });
  },

  // ============ 云同步 ============

  manualSync: function() {
    var self = this;
    if (self.data.syncing) return;
    self.setData({ syncing: true });
    app.syncData().then(function(result) {
      var now = new Date();
      var ts = now.getHours().toString().padStart(2, '0') + ':' +
               now.getMinutes().toString().padStart(2, '0');
      app.globalData._lastSyncTime = ts;
      self.setData({ syncing: false, lastSyncTime: ts });
      if (result.ok) {
        app.globalData.groups = app.loadGroups();
        app.globalData.groupMap = app.loadGroupMap();
        self.buildGroupTabs();
        self.applyFilter();
        wx.showToast({ title: '同步成功', icon: 'success', duration: 1000 });
      } else {
        wx.showToast({ title: result.error || '同步失败', icon: 'none' });
      }
    }).catch(function() {
      self.setData({ syncing: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  autoSync: function() {
    if (app.globalData._synced) return;
    if (this.data.syncing) return;
    var self = this;
    self.setData({ syncing: true });
    app.syncData().then(function(result) {
      var now = new Date();
      var ts = now.getHours().toString().padStart(2, '0') + ':' +
               now.getMinutes().toString().padStart(2, '0');
      app.globalData._synced = true;
      app.globalData._lastSyncTime = ts;
      self.setData({ syncing: false, lastSyncTime: ts });
      if (result.ok) {
        app.globalData.groups = app.loadGroups();
        app.globalData.groupMap = app.loadGroupMap();
        self.buildGroupTabs();
        var codes = app.loadCodes();
        if (codes.length > 0) self.loadFunds(codes);
      }
    }).catch(function() {
      self.setData({ syncing: false });
    });
  },


});