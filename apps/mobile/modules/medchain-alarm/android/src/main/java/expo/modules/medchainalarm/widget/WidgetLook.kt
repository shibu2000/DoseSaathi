package expo.modules.medchainalarm.widget

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import androidx.annotation.DrawableRes
import expo.modules.medchainalarm.R

/** One app colour theme in one appearance. Values mirror NatureLandscapeBanner.tsx and the app palettes. */
internal data class ThemeTone(
  val accent: Int,
  val textPrimary: Int,
  val textSecondary: Int,
  /** Bottom colour of the sky gradient; used to blend the art and round its corners on Android 11 and older. */
  val skyBottom: Int,
  /** Surface behind the scenic countdown pill. */
  val pillSurface: Int,
  @DrawableRes val sky: Int,
  @DrawableRes val landscape: Int,
  /** Top colour of the sky gradient (full-screen alarm background). */
  val skyTop: Int = skyBottom
)

internal data class WidgetTheme(
  val key: String,
  val light: ThemeTone,
  val dark: ThemeTone,
  @DrawableRes val skyAuto: Int,
  @DrawableRes val landscapeAuto: Int
)

/** Neutral text colours for the glass widget, which sits on an unknown wallpaper. */
internal data class GlassInk(val textPrimary: Int, val textSecondary: Int)

/**
 * Theme + appearance the widget is drawn with.
 *
 * When the app appearance is "system" on Android 12+, colours are sent as day/night pairs and drawables as
 * `-night` aliases, so the launcher switches the widget with the phone's dark mode without the app running.
 */
internal class WidgetLook(
  val theme: WidgetTheme,
  val isDark: Boolean,
  val followsSystem: Boolean
) {
  fun tone(): ThemeTone = if (isDark) theme.dark else theme.light

  companion object {
    private const val WHITE = 0xFFFFFFFF.toInt()

    private val NATURE = WidgetTheme(
      key = "nature",
      light = ThemeTone(0xFF006156.toInt(), 0xFF12302A.toInt(), 0xFF4C615A.toInt(), 0xFFCEE8D0.toInt(), WHITE,
        R.drawable.widget_sky_nature, R.drawable.widget_landscape_nature, 0xFFE6F3E6.toInt()),
      dark = ThemeTone(0xFF5FD3C1.toInt(), 0xFFF0FDFA.toInt(), 0xFFA7BDB6.toInt(), 0xFF1D2E28.toInt(), 0xFF0B1411.toInt(),
        R.drawable.widget_sky_nature_dark, R.drawable.widget_landscape_nature_dark, 0xFF0F1A17.toInt()),
      skyAuto = R.drawable.widget_sky_nature_auto,
      landscapeAuto = R.drawable.widget_landscape_nature_auto
    )

    private val OCEAN = WidgetTheme(
      key = "ocean",
      light = ThemeTone(0xFF0B5A8F.toInt(), 0xFF0F2536.toInt(), 0xFF4A6276.toInt(), 0xFFCBE5F5.toInt(), WHITE,
        R.drawable.widget_sky_ocean, R.drawable.widget_landscape_ocean, 0xFFE2F0F9.toInt()),
      dark = ThemeTone(0xFF6CB8F0.toInt(), 0xFFEEF6FD.toInt(), 0xFF9DB4CA.toInt(), 0xFF16283C.toInt(), 0xFF0A1420.toInt(),
        R.drawable.widget_sky_ocean_dark, R.drawable.widget_landscape_ocean_dark, 0xFF0B1622.toInt()),
      skyAuto = R.drawable.widget_sky_ocean_auto,
      landscapeAuto = R.drawable.widget_landscape_ocean_auto
    )

    private val SUNSET = WidgetTheme(
      key = "sunset",
      light = ThemeTone(0xFFA8401F.toInt(), 0xFF33190F.toInt(), 0xFF7A5548.toInt(), 0xFFF8D1BD.toInt(), WHITE,
        R.drawable.widget_sky_sunset, R.drawable.widget_landscape_sunset, 0xFFFCE7DA.toInt()),
      dark = ThemeTone(0xFFF29270.toInt(), 0xFFFDF4F0.toInt(), 0xFFC4A59A.toInt(), 0xFF2E1A14.toInt(), 0xFF170C09.toInt(),
        R.drawable.widget_sky_sunset_dark, R.drawable.widget_landscape_sunset_dark, 0xFF1C0F0B.toInt()),
      skyAuto = R.drawable.widget_sky_sunset_auto,
      landscapeAuto = R.drawable.widget_landscape_sunset_auto
    )

    private val LAVENDER = WidgetTheme(
      key = "lavender",
      light = ThemeTone(0xFF5B3F8C.toInt(), 0xFF251A33.toInt(), 0xFF67597C.toInt(), 0xFFDFD8F0.toInt(), WHITE,
        R.drawable.widget_sky_lavender, R.drawable.widget_landscape_lavender, 0xFFEFEBF8.toInt()),
      dark = ThemeTone(0xFFB997E6.toInt(), 0xFFF8F4FD.toInt(), 0xFFB6A8C9.toInt(), 0xFF231A33.toInt(), 0xFF100C17.toInt(),
        R.drawable.widget_sky_lavender_dark, R.drawable.widget_landscape_lavender_dark, 0xFF120E1A.toInt()),
      skyAuto = R.drawable.widget_sky_lavender_auto,
      landscapeAuto = R.drawable.widget_landscape_lavender_auto
    )

    val GLASS_LIGHT = GlassInk(0xFF0F1513.toInt(), 0xFF3B4542.toInt())
    val GLASS_DARK = GlassInk(WHITE, 0xFFCBD3D0.toInt())

    /** "classic" and "glassmorphism" use the nature palette, as the app does. */
    fun themeFor(name: String?): WidgetTheme {
      val n = name.orEmpty().lowercase()
      return when {
        n.contains("ocean") -> OCEAN
        n.contains("sunset") -> SUNSET
        n.contains("lavender") -> LAVENDER
        else -> NATURE
      }
    }

    fun resolve(context: Context, data: WidgetDoseData?): WidgetLook {
      val theme = themeFor(data?.theme)
      val appearance = data?.appearance?.lowercase().orEmpty()
      return when (appearance) {
        "dark" -> WidgetLook(theme, isDark = true, followsSystem = false)
        "light" -> WidgetLook(theme, isDark = false, followsSystem = false)
        "system" -> WidgetLook(
          theme,
          isDark = systemIsDark(context),
          followsSystem = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        )
        // Data written by older app versions only has isDark.
        else -> WidgetLook(theme, isDark = data?.isDark == true, followsSystem = false)
      }
    }

    private fun systemIsDark(context: Context): Boolean =
      (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
  }
}
