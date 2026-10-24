package se.lierikes.homeenergy.mobile;

import android.app.Activity;
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
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * A lightweight, permission-minimal Home-Energy Android shell.
 * No Google Home SDK, no device commands, no background operation.
 */
public final class MainActivity extends Activity {
    private static final String TAG = "HomeEnergyMobile";
    private static final String DASHBOARD = "https://energy.li-erikes.se/";
    private static final String TRUSTED_HOST = "energy.li-erikes.se";
    private WebView webView;
    private TextView statusView;
    private ProgressBar progressBar;
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
        title.setText("HOME-ENERGY");
        title.setTextSize(19f);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setTextColor(Color.rgb(247, 223, 149));
        title.setPadding(padding, 0, padding, 0);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, -2, 1f));

        Button home = new Button(this);
        home.setText("Home");
        home.setAllCaps(false);
        home.setOnClickListener(v -> webView.loadUrl(DASHBOARD));
        toolbar.addView(home);
        Button refresh = new Button(this);
        refresh.setText("Reload");
        refresh.setAllCaps(false);
        refresh.setOnClickListener(v -> webView.reload());
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
                    setStatus("Connected · Google Home controls are not enabled in this app");
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

        statusView = new TextView(this);
        statusView.setTextColor(Color.rgb(225, 235, 227));
        statusView.setBackgroundColor(Color.rgb(20, 56, 48));
        statusView.setTextSize(12f);
        statusView.setPadding(padding * 2, padding, padding * 2, padding);
        root.addView(statusView);
        setContentView(root);

        Log.i(TAG, "APP_READY_V020");
        setStatus("Loading Home-Energy dashboard…");
        if (savedInstanceState != null && webView.restoreState(savedInstanceState) != null) {
            return;
        }
        webView.loadUrl(DASHBOARD);
    }

    private void setStatus(String text) {
        if (statusView != null) statusView.setText(text);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
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
