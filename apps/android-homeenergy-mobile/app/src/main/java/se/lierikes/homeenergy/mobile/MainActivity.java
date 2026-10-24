package se.lierikes.homeenergy.mobile;

import androidx.activity.ComponentActivity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ScrollView;
import android.text.InputType;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * A lightweight, permission-minimal Home-Energy Android shell.
 * One installed app. Optional Google Home discovery; no device commands or background switching.
 */
public final class MainActivity extends ComponentActivity {
    private static final String TAG = "HomeEnergyMobile";
    private static final String DASHBOARD = "https://energy.li-erikes.se/";
    private static final String TRUSTED_HOST = "energy.li-erikes.se";
    private WebView webView;
    private TextView statusView;
    private ProgressBar progressBar;
    private ScrollView refossPanel;
    private ScrollView devicesPanel;
    private HomeIntegration googleHomeIntegration;
    private TextView googleStatus;
    private TextView googleDeviceList;
    private RefossSecrets refossSecrets;
    private EditText refossIps;
    private EditText refossKey;
    private TextView refossStatus;
    private Button refossCheck;
    private boolean pageHasError = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(16, 44, 37));
        int padding = Math.round(8f * getResources().getDisplayMetrics().density);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText("Li-Erikes");
        title.setTextSize(16f);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setTextColor(Color.rgb(247, 223, 149));
        title.setPadding(padding, 0, padding, 0);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));

        Button home = new Button(this);
        home.setText("Home");
        home.setAllCaps(false);
        home.setOnClickListener(v -> { showDashboard(); webView.loadUrl(DASHBOARD); });
        toolbar.addView(home);
        Button plugs = new Button(this);
        plugs.setText("Devices");
        plugs.setAllCaps(false);
        plugs.setOnClickListener(v -> showDevices());
        toolbar.addView(plugs);
        Button refresh = new Button(this);
        refresh.setText("↻");
        refresh.setAllCaps(false);
        refresh.setOnClickListener(v -> {
            if (refossPanel.getVisibility() == View.VISIBLE) checkRefoss();
            else if (devicesPanel.getVisibility() == View.VISIBLE) discoverGoogleHome();
            else webView.reload();
        });
        toolbar.addView(refresh);
        root.addView(toolbar);

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(true);
        root.addView(progressBar, new LinearLayout.LayoutParams(-1, padding / 2 + 2));

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); // Required for existing Next.js dashboard
        settings.setDomStorageEnabled(true); // Existing dashboard may store UI state
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("https".equalsIgnoreCase(url.getScheme())
                        && TRUSTED_HOST.equalsIgnoreCase(url.getHost())) {
                    return false;
                }
                // Never grant other origins access to the embedded dashboard context.
                // External domains and custom schemes require the user's browser/apps.
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, url);
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    startActivity(intent);
                } catch (ActivityNotFoundException | SecurityException e) {
                    setStatus("No application can open this link.");
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                pageHasError = false;
                progressBar.setVisibility(View.VISIBLE);
                setStatus("Connecting securely to Home-Energy…");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                if (!pageHasError) {
                    setStatus("Dashboard connected · Devices in top menu");
                }
            }

            @Override
            public void onReceivedError(
                    WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    pageHasError = true;
                    setStatus("Connection unavailable. Check internet and tap Reload.");
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public void onReceivedHttpError(
                    WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                    pageHasError = true;
                    setStatus("Dashboard returned HTTP " + response.getStatusCode() +
                        ". Check access or tap Reload.");
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public void onReceivedSslError(
                    WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                pageHasError = true;
                setStatus("Secure connection failed. Certificate error; connection blocked.");
                progressBar.setVisibility(View.GONE);
            }
        });
        root.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1f));
        try {
            googleHomeIntegration = new HomeIntegrationImpl(this);
        } catch (RuntimeException e) {
            Log.e(TAG, "Google Home initialization failed", e);
        }
        devicesPanel = buildDevicesPanel(padding);
        devicesPanel.setVisibility(View.GONE);
        root.addView(devicesPanel, new LinearLayout.LayoutParams(-1, 0, 1f));
        refossSecrets = new RefossSecrets(this);
        refossPanel = buildRefossPanel(padding);
        refossPanel.setVisibility(View.GONE);
        root.addView(refossPanel, new LinearLayout.LayoutParams(-1, 0, 1f));

        statusView = new TextView(this);
        statusView.setTextColor(Color.rgb(225, 235, 227));
        statusView.setBackgroundColor(Color.rgb(20, 56, 48));
        statusView.setTextSize(12f);
        statusView.setPadding(padding * 2, padding, padding * 2, padding);
        root.addView(statusView);
        setContentView(root);

        Log.i(TAG, "APP_READY_V040");
        setStatus("Loading Home-Energy dashboard…");
        if (savedInstanceState != null && webView.restoreState(savedInstanceState) != null) {
            return;
        }
        webView.loadUrl(DASHBOARD);
    }


    private TextView textLine(String value, int size, int padding) {
        TextView label = new TextView(this);
        label.setText(value);
        label.setTextSize(size);
        label.setTextColor(Color.rgb(233, 241, 236));
        label.setPadding(padding, padding, padding, padding);
        return label;
    }


    private ScrollView buildDevicesPanel(int padding) {
        ScrollView scroll = new ScrollView(this);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(padding * 2, padding, padding * 2, padding * 2);
        panel.addView(textLine("Google Home devices", 21, padding));
        panel.addView(textLine("Use the devices already connected via Google Home / eHomeLife. " +
            "No device IP addresses and no bridge pairing key. This preview only reads " +
            "device names, rooms, connectivity and supported on/off status. " +
            "Existing automations remain unchanged.", 14, padding));

        googleStatus = textLine("Not connected.", 14, padding);
        panel.addView(googleStatus);

        Button authorize = new Button(this);
        authorize.setText("Connect Google Home");
        authorize.setOnClickListener(v -> {
            if (googleHomeIntegration == null) {
                googleStatus.setText("Google Home SDK could not initialize. Check Play services.");
                return;
            }
            googleStatus.setText("Opening Google's home permission screen…");
            googleHomeIntegration.requestPermission((message, devices) -> {
                runOnUiThread(() -> googleStatus.setText(message));
            });
        });
        panel.addView(authorize);

        Button discover = new Button(this);
        discover.setText("Discover devices");
        discover.setOnClickListener(v -> discoverGoogleHome());
        panel.addView(discover);

        if (googleHomeIntegration == null || !googleHomeIntegration.isSupported()) {
            authorize.setEnabled(false);
            discover.setEnabled(false);
            googleStatus.setText("This test build has no Google SDK. " +
                "Install the Google Home-enabled build for authorization and discovery.");
        }
        googleDeviceList = textLine("Devices will appear here after consent.", 14, padding);
        panel.addView(googleDeviceList);

        Button advanced = new Button(this);
        advanced.setText("Advanced: local Refoss setup");
        advanced.setOnClickListener(v -> showRefoss());
        panel.addView(advanced);
        panel.addView(textLine("Google Home access needs an Android OAuth client for this exact " +
            "application ID and signing certificate. Neither Refoss nor Google Home " +
            "devices are reset or modified by discovery.", 12, padding));
        scroll.addView(panel);
        return scroll;
    }

    private void discoverGoogleHome() {
        if (googleHomeIntegration == null || !googleHomeIntegration.isSupported()) {
            googleStatus.setText("Google Home is not available in this build.");
            return;
        }
        googleStatus.setText("Reading devices from Google Home…");
        googleHomeIntegration.readDevices((message, devices) -> {
            runOnUiThread(() -> {
                googleStatus.setText(message);
                StringBuilder text = new StringBuilder();
                for (HomeIntegration.Device d : devices) {
                    text.append(d.name).append(" · ").append(d.room).append("\n");
                    text.append(d.type).append(" · ");
                    text.append(d.online ? "online" : "offline").append(" · ");
                    text.append(d.isOn == null ? "state unknown" : d.isOn ? "ON" : "OFF");
                    if (d.supportsOnOff) text.append(" · switch capable");
                    text.append("\n\n");
                }
                googleDeviceList.setText(text.length() == 0 ? "No devices available." : text.toString());
            });
        });
    }

    private void showDevices() {
        if (refossPanel != null) refossPanel.setVisibility(View.GONE);
        if (webView != null) webView.setVisibility(View.GONE);
        if (devicesPanel != null) devicesPanel.setVisibility(View.VISIBLE);
        progressBar.setVisibility(View.GONE);
        setStatus("Google Home devices · read only");
    }

    private ScrollView buildRefossPanel(int padding) {
        ScrollView scroll = new ScrollView(this);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(padding * 2, padding, padding * 2, padding * 2);
        panel.addView(textLine("Refoss MSS210 · local Wi-Fi", 21, padding));
        panel.addView(textLine(
            "Read-only plug status. Your phone must be on the same Wi-Fi as the plugs. " +
            "Enter their private IP addresses from your router, one per line. " +
            "No Google account, bridge pairing, cloud login or device switching.", 14, padding));
        refossIps = new EditText(this);
        refossIps.setTextColor(Color.WHITE);
        refossIps.setHintTextColor(Color.LTGRAY);
        refossIps.setHint("192.168.1.30\n192.168.1.31");
        refossIps.setSingleLine(false);
        refossIps.setMinLines(3);
        refossIps.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        refossIps.setText(refossSecrets.addresses());
        panel.addView(refossIps);

        panel.addView(textLine("Refoss local device key (optional for first status attempt; NOT the Home-Energy bridge key)", 13, padding));
        refossKey = new EditText(this);
        refossKey.setTextColor(Color.WHITE);
        refossKey.setHintTextColor(Color.LTGRAY);
        refossKey.setHint(refossSecrets.hasKey() ? "Saved securely. Leave blank to keep." : "Only if required by your plug");
        refossKey.setSingleLine(true);
        refossKey.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        panel.addView(refossKey);

        Button save = new Button(this);
        save.setText("Save local settings");
        save.setOnClickListener(v -> {
            try {
                List<String> hosts = parseHosts(refossIps.getText().toString());
                refossSecrets.saveAddresses(android.text.TextUtils.join("\n", hosts));
                if (refossKey.length() > 0) refossSecrets.saveKey(refossKey.getText().toString());
                refossKey.getText().clear();
                refossStatus.setText("Saved locally on this phone. Tap Check status.");
            } catch (Exception e) {
                refossStatus.setText("Check the private IP addresses or key.");
            }
        });
        panel.addView(save);

        refossCheck = new Button(this);
        refossCheck.setText("Check plug status (read-only)");
        refossCheck.setOnClickListener(v -> checkRefoss());
        panel.addView(refossCheck);

        refossStatus = textLine("No devices checked yet. On/off control is deliberately disabled.", 14, padding);
        panel.addView(refossStatus);
        scroll.addView(panel);
        return scroll;
    }

    private List<String> parseHosts(String input) {
        LinkedHashSet<String> addresses = new LinkedHashSet<>();
        for (String host : input.split("[\\s,;]+")) {
            if (host.isEmpty()) continue;
            if (!RefossLan.privateIpv4(host)) throw new IllegalArgumentException("Private IPv4 required");
            addresses.add(host);
            if (addresses.size() > 16) throw new IllegalArgumentException("Too many devices");
        }
        if (addresses.isEmpty()) throw new IllegalArgumentException("Add a plug IP address");
        return new ArrayList<>(addresses);
    }

    private void showDashboard() {
        if (refossPanel != null) refossPanel.setVisibility(View.GONE);
        if (devicesPanel != null) devicesPanel.setVisibility(View.GONE);
        if (webView != null) webView.setVisibility(View.VISIBLE);
        setStatus("Li-Erikes Energy dashboard");
    }

    private void showRefoss() {
        if (webView != null) webView.setVisibility(View.GONE);
        if (devicesPanel != null) devicesPanel.setVisibility(View.GONE);
        if (refossPanel != null) refossPanel.setVisibility(View.VISIBLE);
        progressBar.setVisibility(View.GONE);
        setStatus("Local Refoss status · read only");
    }

    private void checkRefoss() {
        final List<String> hosts;
        try {
            hosts = parseHosts(refossSecrets.addresses());
        } catch (Exception e) {
            refossStatus.setText("Save one or more private LAN addresses first.");
            return;
        }
        refossCheck.setEnabled(false);
        refossStatus.setText("Checking configured plugs on this Wi-Fi…");
        new Thread(() -> {
            StringBuilder result = new StringBuilder();
            try {
                String key = refossSecrets.getKey();
                for (String host : hosts) {
                    result.append(host).append(": ");
                    try {
                        RefossLan.DeviceState state = RefossLan.read(host, key);
                        result.append(state.model).append(" · ");
                        result.append(state.on == null ? "state unavailable" : state.on ? "ON" : "OFF");
                    } catch (SecurityException ex) {
                        result.append("authorization failed — local Refoss key may be needed");
                    } catch (Exception ex) {
                        result.append("unavailable — check Wi-Fi, IP and device key");
                    }
                    result.append("\n");
                }
            } catch (Exception ex) {
                result.append("Unable to unlock locally saved key. Re-enter your Refoss key.");
            }
            final String report = result.toString();
            runOnUiThread(() -> {
                if (!isFinishing() && !isDestroyed()) {
                    refossStatus.setText(report);
                    refossCheck.setEnabled(true);
                }
            });
        }, "refoss-local-read").start();
    }

    private void setStatus(String text) {
        if (statusView != null) statusView.setText(text);
    }

    @Override
    public void onBackPressed() {
        if (refossPanel != null && refossPanel.getVisibility() == View.VISIBLE) {
            showDevices();
        } else if (devicesPanel != null && devicesPanel.getVisibility() == View.VISIBLE) {
            showDashboard();
        } else if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
