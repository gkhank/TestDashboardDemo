/*
 * Helpers for the TestEngineFramework REST client. The abstract @rest methods are handled by the platform.
 */
var log = Logger.for('TestEngineApi');

function configureConnection(baseUrl, token) {
  var url = baseUrl.trim();
  if (url.charAt(url.length - 1) !== '/') {
    url = url + '/';
  }
  var auth = token ? 'Bearer ' + token.trim() : TestEngineApi.make().apiAuth();
  TestEngineApi.setApiUrlAndAuth(url, auth, ConfigOverride.APP);
  log.info('TestEngine API base URL set to {}', url);
  return connectionStatus();
}

function connectionStatus() {
  if (!TestEngineApi.isUrlConfigured()) {
    return TestEngineApi.ConnectionStatus.make({
      configured: false,
      reachable: false,
      message: 'No TestEngine API URL configured yet. Add it on the Settings page.',
    });
  }
  var baseUrl = TestEngineApi.make().apiUrl();
  try {
    // The API answers with a JSON string such as "SYS"; anything longer is not an environment name.
    var raw = TestEngineApi.executionEnvironment();
    var env = raw == null ? null : String(raw).replace(/"/g, '');
    env = env && env.length <= 12 ? env : null;
    return TestEngineApi.ConnectionStatus.make({
      configured: true,
      baseUrl: baseUrl,
      reachable: true,
      serverEnvironment: env,
      message: 'Connected',
    });
  } catch (e) {
    log.warn('TestEngine API not reachable at {}: {}', baseUrl, e.message);
    return TestEngineApi.ConnectionStatus.make({
      configured: true,
      baseUrl: baseUrl,
      reachable: false,
      message: e.message,
    });
  }
}
