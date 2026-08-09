var app = getApp();

Page({
  _timer: null,
  data: {
    indices: [],
    sectors: [],
    loading: true,
    error: false,
    upCount: 0,
    downCount: 0,
    updateTime: '',
    refreshing: false
  },

  onLoad: function() {
    this.fetchData();
  },

  onShow: function() {
    this.startAutoRefresh();
  },

  onHide: function() {
    this.stopAutoRefresh();
  },

  onUnload: function() {
    this.stopAutoRefresh();
  },

  startAutoRefresh: function() {
    var self = this;
    self.fetchData();
    this._timer = setInterval(function() {
      self.fetchData();
    }, 15000);
  },

  stopAutoRefresh: function() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  onRefresh: function() {
    var self = this;
    self.setData({ refreshing: true });
    self.fetchData().then(function() {
      self.setData({ refreshing: false });
    }).catch(function() {
      self.setData({ refreshing: false });
    });
  },

  onRetry: function() {
    this.setData({ loading: true, error: false });
    this.fetchData();
  },

  fetchData: function() {
    var self = this;
    if (!self._firstLoad) {
      self._firstLoad = true;
      self.setData({ loading: true, error: false, errorMsg: '' });
    }

    var gotIndices = false;
    var gotSectors = false;
    var errMsg = '';

    var p1 = app.fetchIndices().then(function(result) {
      console.log('fetchIndices count:', result && result.length);
      var items = result;
      if (items && items.length) {
        gotIndices = true;
        var fmt = items.map(function(item) {
          var changePct = parseFloat(item.changePct) || 0;
          var change = parseFloat(item.change) || 0;
          return {
            code: item.code,
            name: item.name,
            price: item.price != null ? item.price.toFixed(2) : '--',
            changePct: changePct,
            changePctStr: (changePct >= 0 ? '+' : '') + changePct.toFixed(2),
            changeStr: (change >= 0 ? '+' : '') + change.toFixed(2),
            up: changePct >= 0
          };
        });
        self.setData({ indices: fmt });
      } else if (result && result.error) {
        errMsg = result.error;
      }
    }).catch(function(e) {
      console.error('fetchIndices error:', e);
      errMsg = (e && e.message) || String(e);
    });

    var p2 = app.fetchSectors().then(function(result) {
      console.log('fetchSectors count:', result && result.length);
      var items = result;
      if (items && items.length) {
        gotSectors = true;
        var fmt = items.map(function(item) {
          var changePct = parseFloat(item.changePct) || 0;
          return {
            code: item.code,
            name: item.name,
            changePct: changePct,
            changePctStr: (changePct >= 0 ? '+' : '') + changePct.toFixed(2),
            up: changePct >= 0
          };
        });
        self.setData({ sectors: fmt });
      } else if (result && result.error && !errMsg) {
        errMsg = result.error;
      }
    }).catch(function(e) {
      console.error('fetchSectors error:', e);
      if (!errMsg) errMsg = (e && e.message) || String(e);
    });

    return Promise.all([p1, p2]).then(function() {
      var now = new Date();
      var ts = now.getHours().toString().padStart(2, '0') + ':' +
               now.getMinutes().toString().padStart(2, '0') + ':' +
               now.getSeconds().toString().padStart(2, '0');
      var hasData = gotIndices || gotSectors;
      var upCount = 0, downCount = 0;
      var indices = self.data.indices || [];
      var sectors = self.data.sectors || [];
      indices.forEach(function(item) {
        if (item.changePct > 0) upCount++;
        else if (item.changePct < 0) downCount++;
      });
      sectors.forEach(function(item) {
        if (item.changePct > 0) upCount++;
        else if (item.changePct < 0) downCount++;
      });
      self.setData({
        loading: false,
        error: !hasData,
        errorMsg: hasData ? '' : (errMsg || '行情数据加载失败，请检查网络或确认云函数已部署'),
        updateTime: hasData ? ts : '',
        upCount: upCount,
        downCount: downCount
      });
    });
  },

  goFund: function() {
    wx.redirectTo({ url: '/pages/index/index' });
  },

  goDiscover: function() {
    wx.redirectTo({ url: '/pages/discover/discover' });
  },

  noop: function() {},

    navigateToFund: function() {
    wx.navigateBack({
      fail: function() {
        wx.redirectTo({ url: '/pages/index/index' });
      }
    });
  }
});
