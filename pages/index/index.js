var app = getApp();

Page({
  _timer: null,
  data: {
    funds: [],
    displayFunds: [],
    loading: false,
    tabs: [{ id: 'all', name: '全部' }, { id: 'ungrouped', name: '未分组' }],
    activeTab: 'all',
    groups: [],
    // add modal
    showAddModal: false,
    inputCode: '',
    addGroupId: '',
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
    // refresh
    refreshing: false
  },


  noop: function() {},

  onLoad: function() {
    var self = this;
    app.globalData.groups = app.loadGroups();
    app.globalData.groupMap = app.loadGroupMap();
    self.buildTabs();

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

  buildTabs: function() {
    var groups = app.globalData.groups;
    var tabs = [{ id: 'all', name: '全部' }, { id: 'ungrouped', name: '未分组' }];
    for (var i = 0; i < groups.length; i++) {
      tabs.push({ id: groups[i].id, name: groups[i].name });
    }
    this.setData({ tabs: tabs, groups: groups });
  },

 switchTab: function(e) {
   var id = e.currentTarget.dataset.id;
  this.setData({ activeTab: id });
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

  applyFilter: function() {
    var funds = app.globalData.funds;
    var map = app.globalData.groupMap;
    var tab = this.data.activeTab;

    var groups = app.globalData.groups;
    function groupName(code) {
      var gid = map[code];
      if (!gid) return '未分组';
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].id === gid) return groups[i].name;
      }
      return '未分组';
    }

    var result;
    if (tab === 'all') {
      result = funds;
    } else if (tab === 'ungrouped') {
      result = funds.filter(function(f) { return !map[f.code]; });
    } else {
      result = funds.filter(function(f) { return map[f.code] === tab; });
    }
    result.forEach(function(f) { f._groupName = groupName(f.code); });
    this.setData({ displayFunds: result });
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
   this.setData({ showAddModal: true, inputCode: '', addGroupId: '' });
 },
  showAddModal: function() {
    var activeTab = this.data.activeTab;
    var defaultGroup = '';
    if (activeTab !== 'all' && activeTab !== 'ungrouped') {
      defaultGroup = activeTab;
    }
    this.setData({ showAddModal: true, inputCode: '', addGroupId: defaultGroup });
  },

  hideAddModal: function() {
    this.setData({ showAddModal: false, adding: false });
  },

  onInputCode: function(e) { this.setData({ inputCode: e.detail.value }); },

  pickGroup: function(e) { this.setData({ addGroupId: e.currentTarget.dataset.id }); },

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

    var fund = { code: code, name: '', nav: null, changePct: 0, date: '', holdings: null, news: null, suggestion: null };
    self.fetchOne(fund).then(function() {
      app.globalData.funds.push(fund);
      app.saveCodes(app.globalData.funds.map(function(f) { return f.code; }));
      if (groupId) app.setFundGroup(code, groupId);
      self.setData({ funds: app.globalData.funds, showAddModal: false, adding: false, inputCode: '' });
      self.applyFilter();
      wx.showToast({ title: '添加成功', icon: 'success' });
    }).catch(function() {
      self.setData({ adding: false });
      wx.showToast({ title: '添加失败', icon: 'none' });
    });
  },

  // ============ 移动分组 ============

  showMoveGroup: function(e) {
    var idx = e.currentTarget.dataset.index;
    var fund = app.globalData.funds[idx];
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
    var fund = app.globalData.funds[idx];
    if (!fund) return;
    app.setFundGroup(fund.code, groupId || null);
    this.setData({ showMoveModal: false });
    this.applyFilter();
    wx.showToast({ title: '已移动', icon: 'none', duration: 1000 });
  },

  // ============ 删除基金 ============

  confirmDelete: function(e) {
    var idx = e.currentTarget.dataset.index;
    var fund = app.globalData.funds[idx];
    this.setData({ showDeleteModal: true, deleteName: fund.name || fund.code, deleteIndex: idx });
  },
  hideDeleteModal: function() { this.setData({ showDeleteModal: false }); },
  executeDelete: function() {
    var idx = this.data.deleteIndex;
    if (idx < 0) return;
    var fund = app.globalData.funds[idx];
    app.setFundGroup(fund.code, null);
    app.globalData.funds.splice(idx, 1);
    app.saveCodes(app.globalData.funds.map(function(f) { return f.code; }));
    this.setData({ funds: app.globalData.funds, showDeleteModal: false });
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
    this.buildTabs();
    this.applyFilter();
  },
  createGroup: function() {
    var name = (this.data.newGroupName || '').trim();
    if (!name) { wx.showToast({ title: '请输入分组名称', icon: 'none' }); return; }
    app.addGroup(name);
    this.setData({ newGroupName: '', groups: app.globalData.groups });
    this.buildTabs();
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
    this.buildTabs();
  },
  cancelRename: function() { this.setData({ gmEditId: '', gmEditName: '' }); },

  confirmDelGroup: function(e) {
    this.setData({ showDelGroupModal: true, delGroupId: e.currentTarget.dataset.id, delGroupName: e.currentTarget.dataset.name });
  },
  hideDelGroupModal: function() { this.setData({ showDelGroupModal: false }); },
  executeDelGroup: function() {
    app.deleteGroup(this.data.delGroupId);
    this.setData({ showDelGroupModal: false, groups: app.globalData.groups });
    if (this.data.activeTab === this.data.delGroupId) {
      this.setData({ activeTab: 'all' });
    }
    this.buildTabs();
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
   this.buildTabs();
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
    this.buildTabs();
    this.applyFilter();
    wx.showToast({ title: '已重命名', icon: 'none', duration: 1000 });
  },
});
