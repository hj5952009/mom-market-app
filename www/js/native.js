/* Capacitor 플러그인 감싸기. 웹(데모·미리보기)에서는 조용히 아무 일도 하지 않거나 웹 대체 기능을 쓴다. */
(function (root) {
  'use strict';
  var Cap = root.Capacitor;
  var isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  var cache = {};
  function plugin(name) {
    if (!isNative || !Cap || !Cap.registerPlugin) return null;
    if (!cache[name]) { try { cache[name] = Cap.registerPlugin(name); } catch (e) { cache[name] = null; } }
    return cache[name];
  }
  var UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';

  // GET → 파싱된 JSON (KModel.parseChart는 {data} 감싸기도 받는다)
  function httpGet(url, timeoutMs) {
    var http = root.capacitorExports && root.capacitorExports.CapacitorHttp;
    if (isNative && http) {
      return http.get({ url: url, headers: { 'User-Agent': UA, Accept: 'application/json' }, connectTimeout: timeoutMs || 20000, readTimeout: timeoutMs || 20000, responseType: 'json' })
        .then(function (res) {
          var d = res.data;
          if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { /* keep */ } }
          if (res.status >= 400 && !(d && d.chart)) { var er = new Error('HTTP ' + res.status); er.status = res.status; throw er; }
          return d;
        });
    }
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok && !(j && j.chart)) { var er = new Error('HTTP ' + r.status); er.status = r.status; throw er; } return j; });
    });
  }

  // ---------------------------------------------------------------- 알림 (ux1 4-6)
  var NOTI_IDS = [101, 102, 103, 104, 105, 106, 107]; // 100 + 요일(1=일 ... 7=토)
  var Noti = {
    available: function () { return !!plugin('LocalNotifications'); },
    check: function () {
      var p = plugin('LocalNotifications'); if (!p) return Promise.resolve('unavailable');
      return p.checkPermissions().then(function (r) { return r.display; }).catch(function () { return 'unknown'; });
    },
    request: function () {
      var p = plugin('LocalNotifications'); if (!p) return Promise.resolve('unavailable');
      return p.requestPermissions().then(function (r) { return r.display; }).catch(function () { return 'denied'; });
    },
    // settings: {on, time:'08:40', weekend:false}
    apply: function (settings) {
      var p = plugin('LocalNotifications'); if (!p) return Promise.resolve(false);
      return p.cancel({ notifications: NOTI_IDS.map(function (id) { return { id: id }; }) }).catch(function () { /* none */ }).then(function () {
        if (!settings.on) return true;
        var h = +settings.time.slice(0, 2), m = +settings.time.slice(3, 5);
        var days = settings.weekend ? [1, 2, 3, 4, 5, 6, 7] : [2, 3, 4, 5, 6];
        return p.schedule({
          notifications: days.map(function (wd) {
            return {
              id: 100 + wd, title: '시장 나침반',
              body: '오늘 코스피 예측이 준비됐어요. 열어 보세요. (참고용 예보)',
              schedule: { on: { weekday: wd, hour: h, minute: m }, allowWhileIdle: true },
              isExactNotification: false, smallIcon: 'ic_stat_compass', iconColor: '#7A4E08', autoCancel: true
            };
          })
        }).then(function () { return true; });
      }).catch(function () { return false; });
    },
    onTap: function (cb) {
      var p = plugin('LocalNotifications'); if (!p) return;
      try { p.addListener('localNotificationActionPerformed', function () { cb(); }); } catch (e) { /* ignore */ }
    }
  };

  // ---------------------------------------------------------------- 기타
  function share(title, text) {
    var p = plugin('Share');
    if (p) return p.share({ title: title, text: text, dialogTitle: '오류 정보 보내기' }).then(function () { return 'shared'; }).catch(function () { return 'cancelled'; });
    if (root.navigator && root.navigator.share) return root.navigator.share({ title: title, text: text }).then(function () { return 'shared'; }).catch(function () { return 'cancelled'; });
    return Promise.resolve('unsupported');
  }
  // 시스템 글씨 배율 (ux1 3-1): 웹뷰 자체 확대는 100%로 고정하고 배율을 직접 적용
  function textZoom() {
    var p = plugin('TextZoom');
    if (!p) return Promise.resolve(null);
    return p.getPreferred().then(function (r) {
      return p.set({ value: 1 }).catch(function () { /* ignore */ }).then(function () { return r && r.value ? r.value : 1; });
    }).catch(function () { return null; });
  }
  function onBack(cb) { var p = plugin('App'); if (p) try { p.addListener('backButton', cb); } catch (e) { /* ignore */ } }
  function onResume(cb) { var p = plugin('App'); if (p) try { p.addListener('resume', cb); } catch (e) { /* ignore */ } }
  function exitApp() { var p = plugin('App'); if (p) p.exitApp(); }
  function appInfo() { var p = plugin('App'); return p ? p.getInfo().catch(function () { return null; }) : Promise.resolve(null); }
  function onNetwork(cb) {
    var p = plugin('Network');
    if (p) { try { p.addListener('networkStatusChange', function (s) { cb(!!s.connected); }); } catch (e) { /* ignore */ } return; }
    root.addEventListener('online', function () { cb(true); });
    root.addEventListener('offline', function () { cb(false); });
  }
  function networkStatus() {
    var p = plugin('Network');
    if (p) return p.getStatus().then(function (s) { return !!s.connected; }).catch(function () { return true; });
    return Promise.resolve(root.navigator ? root.navigator.onLine !== false : true);
  }
  // 앱 안 웹뷰에서 바깥 주소로 이동하면 Capacitor가 휴대폰 브라우저(내려받기)로 넘겨준다.
  function openUrl(url) { if (isNative) { root.location.href = url; return; } try { root.open(url, '_blank'); } catch (e) { root.location.href = url; } }

  root.Native = {
    isNative: isNative, plugin: plugin, httpGet: httpGet, Noti: Noti, share: share, textZoom: textZoom,
    onBack: onBack, onResume: onResume, exitApp: exitApp, appInfo: appInfo, onNetwork: onNetwork, networkStatus: networkStatus, openUrl: openUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);
