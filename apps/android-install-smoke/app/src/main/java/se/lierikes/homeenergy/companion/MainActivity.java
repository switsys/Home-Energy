package se.lierikes.homeenergy.companion;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Simple installation/launcher smoke test.
 * No Google Home access, no controls, no background work, and no permissions.
 */
public final class MainActivity extends Activity {
    private static final String TAG = "HomeEnergyInstallTest";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.i(TAG, "LAUNCHED_OK_V2");

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setBackgroundColor(Color.rgb(19, 57, 49));
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        layout.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText("Home-Energy");
        title.setTextColor(Color.WHITE);
        title.setTextSize(30);
        title.setGravity(Gravity.CENTER);
        layout.addView(title);

        TextView info = new TextView(this);
        info.setText("Android installation test v0.1.1\n\n" +
                "If you can see this screen, the APK installed and launched correctly.\n\n" +
                "Google Home access: OFF\nDevice controls: OFF\n" +
                "Background services: NONE");
        info.setTextColor(Color.rgb(213, 232, 220));
        info.setTextSize(16);
        info.setGravity(Gravity.CENTER);
        info.setPadding(0, padding, 0, padding);
        layout.addView(info);

        Button dashboard = new Button(this);
        dashboard.setText("Open Home-Energy dashboard");
        dashboard.setOnClickListener(v -> {
            try {
                Intent open = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://energy.li-erikes.se/"));
                startActivity(open);
            } catch (ActivityNotFoundException e) {
                Toast.makeText(this, "No web browser available", Toast.LENGTH_LONG).show();
            }
        });
        layout.addView(dashboard);
        setContentView(layout);
    }
}
