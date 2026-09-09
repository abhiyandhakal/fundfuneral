package com.fundfuneral;

import android.app.Activity;
import android.content.*;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.nsd.*;
import android.os.*;
import android.security.keystore.*;
import com.facebook.react.bridge.*;
import java.io.*;
import java.net.*;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.*;
import javax.security.auth.x500.X500Principal;
import org.json.*;

public class FundNative extends ReactContextBaseJavaModule {
  private final ReactApplicationContext context;
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final SQLiteDatabase db;
  private Promise scanPromise;
  private Promise filePromise;
  private String fileContents;
  private final String alias = "fund-funeral-device-ec-v1";
  FundNative(ReactApplicationContext c) {
    super(c);
    context = c;
    db = c.openOrCreateDatabase("fund-funeral.sqlite3", 0, null);
    db.enableWriteAheadLogging();
    db.execSQL("PRAGMA synchronous=FULL");
    db.execSQL("CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY "
               + "CHECK(id=1),json TEXT NOT NULL)");
    db.execSQL(
        "CREATE TABLE IF NOT EXISTS changes(id TEXT PRIMARY KEY,origin TEXT "
        +
        "NOT NULL,seq INTEGER NOT NULL,json TEXT NOT NULL,UNIQUE(origin,seq))");
    context.addActivityEventListener(new BaseActivityEventListener() {
      @Override
      public void onActivityResult(Activity a, int request, int result,
                                   Intent data) {
        if (request == 49374) {
          com.google.zxing.integration.android.IntentResult scan =
              com.google.zxing.integration.android.IntentIntegrator
                  .parseActivityResult(request, result, data);
          if (scanPromise != null) {
            scanPromise.resolve(scan == null ? null : scan.getContents());
            scanPromise = null;
          }
          return;
        }
        if (request != 4001 && request != 4002)
          return;
        Promise p = filePromise;
        filePromise = null;
        if (p == null)
          return;
        if (result != Activity.RESULT_OK || data == null) {
          p.resolve(null);
          return;
        }
        worker.execute(() -> {
          try {
            if (request == 4001) {
              try (InputStream in =
                       context.getContentResolver().openInputStream(
                           data.getData())) {
                p.resolve(readBounded(in, 32 * 1024 * 1024, false));
              }
            } else {
              try (OutputStream out =
                       context.getContentResolver().openOutputStream(
                           data.getData(), "wt")) {
                out.write(fileContents.getBytes(
                    java.nio.charset.StandardCharsets.UTF_8));
              }
              p.resolve(true);
            }
          } catch (Exception e) {
            p.reject("FILE", e);
          }
        });
      }
    });
  }
  @Override
  public String getName() {
    return "FundNative";
  }
  @ReactMethod(isBlockingSynchronousMethod = true)
  public String uuid() {
    return UUID.randomUUID().toString();
  }
  private SharedPreferences prefs() {
    return context.getSharedPreferences("fund-funeral", 0);
  }
  @ReactMethod
  public void load(Promise p) {
    worker.execute(() -> {
      try {
        String device = prefs().getString("device", null);
        if (device == null) {
          device = uuid();
          prefs().edit().putString("device", device).commit();
        }
        JSONObject result = new JSONObject();
        result.put("device", device);
        result.put("name", Build.MODEL);
        result.put("peer", new JSONObject(prefs().getString("peer", "{}")));
        try (Cursor c =
                 db.rawQuery("SELECT json FROM state WHERE id=1", null)) {
          result.put("state", c.moveToFirst() ? new JSONObject(c.getString(0))
                                              : JSONObject.NULL);
        }
        p.resolve(result.toString());
      } catch (Exception e) {
        p.reject("LOAD", e);
      }
    });
  }
  @ReactMethod
  public void save(String json, Promise p) {
    worker.execute(() -> {
      try {
        JSONObject state = new JSONObject(json);
        JSONArray events = state.getJSONArray("events");
        db.beginTransaction();
        try {
          try (Cursor c =
                   db.rawQuery("SELECT json FROM state WHERE id=1", null)) {
            if (c.moveToFirst() && !new JSONObject(c.getString(0))
                                        .getString("vault")
                                        .equals(state.getString("vault")))
              db.execSQL("DELETE FROM changes");
          }
          for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.getJSONObject(i);
            db.execSQL("INSERT INTO changes(id,origin,seq,json) "
                           + "VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING",
                       new Object[] {e.getString("id"), e.getString("origin"),
                                     e.getLong("seq"), e.toString()});
          }
          db.execSQL("INSERT INTO state(id,json) VALUES(1,?) ON CONFLICT(id) "
                         + "DO UPDATE SET json=excluded.json",
                     new Object[] {json});
          db.setTransactionSuccessful();
        } finally {
          db.endTransaction();
        }
        p.resolve(true);
      } catch (Exception e) {
        p.reject("SAVE", e);
      }
    });
  }
  @ReactMethod
  public void setPeer(String json, Promise p) {
    if (prefs().edit().putString("peer", json).commit())
      p.resolve(true);
    else
      p.reject("SAVE", "Cannot save pairing");
  }
  @ReactMethod
  public void safetyBackup(String contents, Promise p) {
    worker.execute(() -> {
      try {
        File f =
            new File(context.getFilesDir(),
                     "before-restore-" + System.currentTimeMillis() + ".json");
        try (FileOutputStream out = new FileOutputStream(f)) {
          out.write(contents.getBytes(java.nio.charset.StandardCharsets.UTF_8));
          out.getFD().sync();
        }
        p.resolve(f.getName());
      } catch (Exception e) {
        p.reject("BACKUP", e);
      }
    });
  }
  @ReactMethod
  public void scanQr(Promise p) {
    Activity a = getCurrentActivity();
    if (a == null || scanPromise != null) {
      p.reject("SCAN", "Camera is unavailable");
      return;
    }
    scanPromise = p;
    a.runOnUiThread(
        ()
            -> new com.google.zxing.integration.android.IntentIntegrator(a)
                   .setDesiredBarcodeFormats(
                       com.google.zxing.integration.android.IntentIntegrator
                           .QR_CODE)
                   .setPrompt("Scan Fund Funeral pairing invitation")
                   .setBeepEnabled(false)
                   .setOrientationLocked(false)
                   .initiateScan());
  }
  @ReactMethod
  public void pickFile(Promise p) {
    openFile(false, "", "", p);
  }
  @ReactMethod
  public void writeFile(String filename, String contents, Promise p) {
    openFile(true, filename, contents, p);
  }
  private void openFile(boolean write, String name, String contents,
                        Promise p) {
    Activity a = getCurrentActivity();
    if (a == null) {
      p.reject("FILE", "No active screen");
      return;
    }
    if (filePromise != null) {
      p.reject("FILE", "A file dialog is already open");
      return;
    }
    filePromise = p;
    fileContents = contents;
    Intent i = new Intent(write ? Intent.ACTION_CREATE_DOCUMENT
                                : Intent.ACTION_OPEN_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);
    i.setType(write ? (name.endsWith(".csv") ? "text/csv" : "application/json")
                    : "*/*");
    if (write)
      i.putExtra(Intent.EXTRA_TITLE, name);
    a.runOnUiThread(() -> a.startActivityForResult(i, write ? 4002 : 4001));
  }
  private static String readBounded(InputStream in, int max, boolean line)
      throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] b = new byte[8192];
    int count;
  outer:
    while ((count = in.read(b)) != -1) {
      for (int i = 0; i < count; i++) {
        if (line && b[i] == '\n')
          break outer;
        out.write(b[i]);
        if (out.size() > max)
          throw new IOException("Message exceeds size limit");
      }
    }
    return out.toString("UTF-8");
  }
  // Android TLS prehashes handshake signatures; DIGEST_NONE is required for
  // opaque Keystore keys.
  // https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec.Builder#setDigests(java.lang.String...)
  private KeyStore identity() throws Exception {
    KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
    ks.load(null);
    if (!ks.containsAlias(alias)) {
      KeyPairGenerator gen =
          KeyPairGenerator.getInstance("EC", "AndroidKeyStore");
      gen.initialize(
          new KeyGenParameterSpec
              .Builder(alias, KeyProperties.PURPOSE_SIGN |
                                  KeyProperties.PURPOSE_VERIFY)
              .setAlgorithmParameterSpec(
                  new java.security.spec.ECGenParameterSpec("secp256r1"))
              .setDigests(
                  KeyProperties.DIGEST_NONE, KeyProperties.DIGEST_SHA256,
                  KeyProperties.DIGEST_SHA384, KeyProperties.DIGEST_SHA512)
              .setCertificateSubject(new X500Principal("CN=Fund Funeral phone"))
              .setCertificateSerialNumber(java.math.BigInteger.ONE)
              .setCertificateNotBefore(
                  new Date(System.currentTimeMillis() - 86400000))
              .setCertificateNotAfter(
                  new Date(System.currentTimeMillis() + 315360000000L))
              .build());
      gen.generateKeyPair();
    }
    return ks;
  }
  private static String fingerprint(X509Certificate c) throws Exception {
    byte[] bytes = MessageDigest.getInstance("SHA-256").digest(c.getEncoded());
    StringBuilder b = new StringBuilder();
    for (byte v : bytes)
      b.append(String.format(Locale.ROOT, "%02x", v & 255));
    return b.toString();
  }
  @ReactMethod
  public void exchange(String host, int port, String pin, String request,
                       Promise p) {
    worker.execute(() -> {
      try {
        if (!pin.matches("[a-f0-9]{64}") || port < 1 || port > 65535 ||
            request.length() > 16 * 1024 * 1024)
          throw new IOException("Invalid connection invitation");
        KeyStore ks = identity();
        final PrivateKey privateKey = (PrivateKey)ks.getKey(alias, null);
        final X509Certificate cert = (X509Certificate)ks.getCertificate(alias);
        X509ExtendedKeyManager km = new X509ExtendedKeyManager() {
          public String[] getClientAliases(String t,
                                           java.security.Principal[] i) {
            return new String[] {alias};
          }
          public String chooseClientAlias(
              String[] t, java.security.Principal[] i, Socket s) {
            return alias;
          }
          public String[] getServerAliases(String t,
                                           java.security.Principal[] i) {
            return null;
          }
          public String chooseServerAlias(String t, java.security.Principal[] i,
                                          Socket s) {
            return null;
          }
          public X509Certificate[] getCertificateChain(String a) {
            return new X509Certificate[] {cert};
          }
          public PrivateKey getPrivateKey(String a) { return privateKey; }
        };
        TrustManager tm = new X509TrustManager() {
          public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
          }
          public void checkClientTrusted(X509Certificate[] c, String a)
              throws java.security.cert.CertificateException {
            throw new java.security.cert.CertificateException(
                "Client role only");
          }
          public void checkServerTrusted(X509Certificate[] chain, String auth)
              throws java.security.cert.CertificateException {
            try {
              if (chain.length == 0 || !fingerprint(chain[0]).equals(pin))
                throw new java.security.cert.CertificateException(
                    "Device certificate does not match pairing");
              chain[0].checkValidity();
            } catch (Exception e) {
              throw new java.security.cert.CertificateException(e);
            }
          }
        };
        SSLContext ssl = SSLContext.getInstance("TLS");
        ssl.init(new KeyManager[] {km}, new TrustManager[] {tm},
                 new SecureRandom());
        try (SSLSocket socket =
                 (SSLSocket)ssl.getSocketFactory().createSocket()) {
          socket.setEnabledProtocols(new String[] {"TLSv1.2"});
          socket.connect(new InetSocketAddress(host, port), 10000);
          socket.setSoTimeout(20000);
          socket.startHandshake();
          socket.getOutputStream().write(
              (request + "\n")
                  .getBytes(java.nio.charset.StandardCharsets.UTF_8));
          socket.getOutputStream().flush();
          String response =
              readBounded(socket.getInputStream(), 16 * 1024 * 1024, true);
          new JSONObject(response);
          p.resolve(response);
        }
      } catch (Exception e) {
        p.reject("SYNC", e);
      }
    });
  }
  @ReactMethod
  public void discover(Promise p) {
    NsdManager manager =
        (NsdManager)context.getSystemService(Context.NSD_SERVICE);
    JSONArray found = new JSONArray();
    Handler handler = new Handler(Looper.getMainLooper());
    NsdManager.DiscoveryListener listener = new NsdManager.DiscoveryListener() {
      public void onDiscoveryStarted(String t) {}
      public void onDiscoveryStopped(String t) {}
      public void onStopDiscoveryFailed(String t, int c) {}
      public void onStartDiscoveryFailed(String t, int c) {}
      public void onServiceLost(NsdServiceInfo i) {}
      public void onServiceFound(NsdServiceInfo info) {
        manager.resolveService(info, new NsdManager.ResolveListener() {
          public void onResolveFailed(NsdServiceInfo i, int c) {}
          public void onServiceResolved(NsdServiceInfo i) {
            try {
              JSONObject v = new JSONObject();
              v.put("name", i.getServiceName());
              v.put("host", i.getHost().getHostAddress());
              v.put("port", i.getPort());
              byte[] device = i.getAttributes().get("device");
              v.put("device",
                    device == null
                        ? ""
                        : new String(device,
                                     java.nio.charset.StandardCharsets.UTF_8));
              synchronized (found) { found.put(v); }
            } catch (Exception ignored) {
            }
          }
        });
      }
    };
    try {
      manager.discoverServices("_fundfuneral._tcp.", NsdManager.PROTOCOL_DNS_SD,
                               listener);
      handler.postDelayed(() -> {
        try {
          manager.stopServiceDiscovery(listener);
        } catch (Exception ignored) {
        }
        synchronized (found) { p.resolve(found.toString()); }
      }, 4000);
    } catch (Exception e) {
      p.reject("DISCOVERY", e);
    }
  }
}
