package se.lierikes.homeenergy.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.util.Log;
import android.view.View;
import android.view.Gravity;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.webkit.SslErrorHandler;
import android.widget.Button;
import android.widget.TextView;
import android.widget.LinearLayout;

public final class MainActivity extends Activity {
    private static final String TAG = "HomeEnergyMobile";
    private static final String URL = "https://energy.li-erikes.se/";
    private static final String HOST = "energy.li-erikes.se";
    private WebView web;
    private TextView message;
    private LinearLayout devices;
    private boolean onDevices;

    private TextView text(String str, int size) {
        TextView t = new TextView(this);
        t.setText(str); t.setTextSize(size); t.setTextColor(Color.WHITE);
        t.setPadding(16, 12, 16, 12);
        return t;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(14, 42, 37));
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("Li-Erikes", 18);
        title.setTextColor(Color.rgb(255, 215, 94));
        title.setTypeface(null, Typeface.BOLD);
        top.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button home = new Button(this);
        home.setText("Home");
        home.setOnClickListener(v -> showHome());
        top.addView(home);
        Button plugs = new Button(this);
        plugs.setText("Devices");
        plugs.setOnClickListener(v -> showDevices());
        top.addView(plugs);
        root.addView(top);

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                Uri target = request.getUrl();
                if ("https".equalsIgnoreCase(target.getScheme())
                        && HOST.equalsIgnoreCase(target.getHost())) return false;
                Intent external = new Intent(Intent.ACTION_VIEW, target);
                external.addCategory(Intent.CATEGORY_BROWSABLE);
                try { startActivity(external); } catch (ActivityNotFoundException e) {
                    setMessage("No app found to open that link.");
                }
                return true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest req,
                                                    WebResourceError err) {
                if (req.isForMainFrame()) setMessage("Connection failed — check internet and reload.");
            }
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest req,
                                                       WebResourceResponse response) {
                if (req.isForMainFrame()) setMessage("Server HTTP " + response.getStatusCode());
            }
            @Override public void onReceivedSslError(WebView v, SslErrorHandler handler, SslError err) {
                handler.cancel(); setMessage("Secure connection failed.");
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));

        devices = new LinearLayout(this);
        devices.setOrientation(LinearLayout.VERTICAL);
        devices.setPadding(16, 30, 16, 30);
        devices.addView(text("Google Home devices", 22));
        devices.addView(text("Your existing Meross / eHomeLife plugs are already configured in Google Home. Open their controls without setting IP addresses or pairing again.", 15));
        Button open = new Button(this);
        open.setText("Open Google Home");
        open.setOnClickListener(v -> {
            Intent google = getPackageManager().getLaunchIntentForPackage("com.google.android.apps.chromecast.app");
            if (google != null) startActivity(google);
            else setMessage("Google Home is not installed.");
        });
        devices.addView(open);
        devices.addView(text("Direct device discovery requires separate Google Home authorization. This build keeps your working automations untouched.", 13));
        root.addView(devices, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.HORIZONTAL);
        message = text("Loading energy dashboard...", 12);
        bottom.addView(message, new LinearLayout.LayoutParams(0, -2, 1));
        Button reload = new Button(this);
        reload.setText("Reload");
        reload.setOnClickListener(v -> { if (!onDevices) web.reload(); });
        bottom.addView(reload);
        root.addView(bottom);

        setContentView(root);
        showHome();
        Log.i(TAG, "APP_READY_V060");
        web.loadUrl(URL);
    }

    private void setMessage(String msg) { if (message != null) message.setText(msg); }
    private void showHome() {
        onDevices = false;
        devices.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        setMessage("Energy dashboard");
    }
    private void showDevices() {
        onDevices = true;
        web.setVisibility(View.GONE);
        devices.setVisibility(View.VISIBLE);
        setMessage("Existing Google Home controls");
    }
    @Override public void onBackPressed() {
        if (onDevices) showHome();
        else if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
