/**
 * The hand-written text of every topic page: title, introduction, how to choose, FAQ, picks and
 * retired entries. Content only; the logic that reads it is in topics.ts. Topics share one shape,
 * so this file is left out of duplicate-code detection (.sonarcloud.properties).
 */
import type { Topic } from './topics';

export const TOPICS: Topic[] = [
  {
    slug: 'hyprland',
    label: 'Hyprland',
    facet: { kind: 'wm', value: 'hyprland' },
    updated: '2026-10-25',
    title: 'Best Hyprland Dotfiles in {year}, Compared',
    h1: 'The best Hyprland dotfiles in {year}, compared',
    description: '{n} Hyprland dotfiles and tools compared: picks by need, what each install changes, how to undo it, and which projects are no longer maintained.',
    intro: [
      'Hyprland is a dynamic tiling Wayland compositor known for its animations and for how far it can be customized. Out of the box it gives you windows and a config file, nothing else: the bar, launcher, widgets, wallpaper and colors come from the setup you put on top. That is why most people start from someone else’s dotfiles.',
      'The setups below range from complete desktops with their own installer and settings app, to small personal rices you copy by hand. They differ a lot in what they do to your system. Several replace your existing ~/.config folders, install dozens of packages and run their own install script, so the "What it changes" and "Difficulty" columns matter more than the screenshot.',
      'Hyprland also changes its config format between releases. Every entry here is pinned to an exact commit, so the version you read about is the version you install.',
    ],
    choose: [
      'Start from your distro: most complete setups target Arch Linux, a few support Fedora or NixOS. Check the "Works with" column first.',
      'Prefer "Manual setup" or "Easy" entries if you want to understand your desktop; pick a complete desktop if you want everything working on day one and accept a bigger install.',
      'Look at the shell it is built on (Quickshell, AGS, Fabric, eww or Waybar): that is what you will edit later.',
    ],
    faq: [
      {
        q: 'Can I try Hyprland dotfiles without breaking my current desktop?',
        a: 'Yes. Create a second user account and install there first: dotfiles only touch that user’s home folder, apart from the packages they install. On your main account, run the 0xTsoa installer with --dry-run to see the plan, and keep its backups so --rollback can restore your files.',
      },
      {
        q: 'Which Hyprland dotfiles are best for beginners?',
        a: 'The complete desktops with a guided installer and a settings app are the quickest to get working, but they change the most files. If you want to learn how Hyprland fits together, start from a smaller setup marked Manual or Easy and add pieces one at a time.',
      },
      {
        q: 'Why does a Hyprland config stop working after an update?',
        a: 'Hyprland renames and removes options between releases. Setups that track the latest version are updated quickly; quiet or archived ones may need fixes. The Maintenance column shows when each upstream project was last updated.',
      },
    ],
    picks: [
      {
        need: 'A complete desktop with a settings app',
        candidates: [
          { id: 'mylinuxforwork/dotfiles', reason: 'A guided installer, a settings app for the whole desktop and colors taken from your wallpaper. It runs on Arch-based distros, Fedora and openSUSE, and a Live ISO lets you try it in a virtual machine first.' },
          { id: 'hyde-project/hyde', reason: 'A full desktop with Waybar, Rofi and a theme switcher, installed by one script on a fresh Arch install.' },
        ],
      },
      {
        need: 'The most polished interface',
        candidates: [
          { id: 'end-4/dots-hyprland', reason: 'A Quickshell interface with a live overview of your windows, an AI sidebar and Material colors. It is mostly a shell rather than a system setup, and its installer shows every command before running it.' },
          { id: 'caelestia-dots/shell', reason: 'A Quickshell bar, dashboard and launcher with colors from your wallpaper, packaged in the AUR.' },
        ],
      },
      {
        need: 'Many looks to switch between',
        candidates: [
          { id: 'hyde-project/hyde', reason: 'The maintained successor of Hyprdots, with a theme switcher and a gallery of themes. It expects a fresh, minimal Arch install and also takes over GTK and Qt theming, your shell, SDDM and GRUB.' },
        ],
      },
      {
        need: 'On NixOS',
        candidates: [
          { id: 'misterio77/foundry', reason: 'A complete flake with home-manager and a heavily configured Hyprland. It also sets up disk layout, Secure Boot and secrets, so copy the parts you need rather than switching to it as it is.' },
        ],
      },
      {
        need: 'Building your own, piece by piece',
        candidates: [
          { id: 'hyprwm/hyprland-core', reason: 'Hyprland and its default Lua config from your distro’s packages. Add hyprlock and hyprpaper from the same project, then a bar and launcher of your choice: the slowest start, and the one you will understand best.' },
        ],
      },
    ],
    retired: [
      { id: 'prasanthrangan/hyprdots', note: 'No longer maintained: development continues as HyDE.', to: ['hyde-project/hyde'] },
      { id: 'jakoolit/arch-hyprland', note: 'Announced to be archived from March 2026, with maintenance moving to the LinuxBeginnings fork.' },
    ],
  },
  {
    slug: 'dotfiles',
    label: 'Dotfiles',
    facet: { kind: 'category', value: 'dotfiles' },
    updated: '2026-10-25',
    title: 'Linux Dotfiles & Rices, Compared',
    h1: 'Linux dotfiles and full rices, compared',
    description: '{n} complete Linux desktop setups for Hyprland, AwesomeWM, bspwm, dwm and more, with what each install changes and how to undo it.',
    intro: [
      'Dotfiles are the configuration files in your home folder, most of them hidden (their names start with a dot) or kept in ~/.config. Sharing them is how the Linux community passes on a whole desktop: the window manager, bar, launcher, terminal, colors and keybindings that make up a "rice".',
      'This page lists complete setups across window managers, from Wayland compositors like Hyprland to X11 classics like AwesomeWM, bspwm, dwm and Openbox. Each one is pinned to an exact commit and shows, before you install anything, which packages it adds, which folders it writes to and how to restore your previous files.',
    ],
    choose: [
      'Choose the window manager first: a rice built for AwesomeWM will not run on Hyprland, and X11 setups need an X11 session.',
      'NixOS configurations are a different kind of dotfiles: they describe the whole system and need NixOS or home-manager.',
      'Read the "What it changes" column: some setups only copy a few folders, others run their own installer across your system.',
    ],
    faq: [
      {
        q: 'What are dotfiles?',
        a: 'Plain-text configuration files, usually in your home folder or ~/.config, that set up programs like your window manager, shell and editor. Keeping them in a Git repository lets you copy your desktop to another machine, or share it.',
      },
      {
        q: 'What does "ricing" mean?',
        a: 'Customizing a Linux desktop until it looks and works exactly the way you want, usually with a tiling window manager, a custom bar and a consistent color scheme. The finished desktop is called a rice.',
      },
      {
        q: 'How do I install someone else’s dotfiles safely?',
        a: 'Read what the install does before running it, back up your own ~/.config, and prefer installers that can preview and undo. Every entry here has a guided installer with --dry-run and --rollback for the files it changes in your home folder.',
      },
    ],
  },
  {
    slug: 'color-schemes',
    label: 'Color schemes',
    facet: { kind: 'category', value: 'colorscheme' },
    updated: '2026-10-25',
    title: 'Linux Color Schemes & Wallpaper Color Generators',
    h1: 'Linux color schemes and wallpaper color generators',
    description: '{n} color palettes and generators for Linux: Catppuccin, Nord, Gruvbox, pywal, matugen and more, compared by maintenance and install impact.',
    intro: [
      'A color scheme is what makes a desktop look like one piece: the same palette in your terminal, bar, editor and GTK apps. There are two ways to get one. Fixed palettes such as Catppuccin, Nord, Gruvbox, Tokyo Night, Rosé Pine, Everforest and Kanagawa come with ready-made ports for many applications. Generators such as pywal, wallust, matugen and hellwal compute a palette from your wallpaper and write it into your configs through templates.',
      'A third group themes everything from one source: Tinted Theming maintains the Base16 and Base24 schemes and builders, and Stylix applies one palette or wallpaper to a whole NixOS system.',
    ],
    choose: [
      'A palette is only as good as its ports: check that the apps you use (terminal, editor, GTK, bar) have one.',
      'Generators need a template for each app; they shine when your setup already uses them, like many Hyprland dotfiles.',
      'Check maintenance: the original pywal is archived, and maintained forks or alternatives exist.',
    ],
    faq: [
      {
        q: 'What is the difference between pywal, wallust and matugen?',
        a: 'All three generate a palette from your wallpaper. pywal is the original, now archived, with pywal16 as a maintained fork. wallust is a faster pywal-like rewrite in Rust with its own templates. matugen produces Material You palettes and is common in Quickshell and AGS setups.',
      },
      {
        q: 'What is Base16?',
        a: 'A standard that describes a color scheme with 16 colors, so one template per application can render any scheme. Tinted Theming maintains the Base16 and Base24 specifications, schemes and builders.',
      },
      {
        q: 'Can I use one color scheme for my whole desktop?',
        a: 'Yes, with ports or templates for each app. On NixOS, Stylix does this from one setting; elsewhere a generator like wallust or matugen writes the same palette into every config you give it a template for.',
      },
    ],
  },
  {
    slug: 'gtk-themes',
    label: 'GTK themes',
    facet: { kind: 'category', value: 'gtk-theme' },
    updated: '2026-10-25',
    title: 'GTK Themes for Linux: Previews & Safe Install',
    h1: 'GTK themes for Linux, compared',
    description: '{n} GTK themes with previews: Orchis, WhiteSur, Colloid, Catppuccin, Dracula and more, with GTK4 support, maintenance and what each install changes.',
    intro: [
      'GTK themes restyle the windows, buttons and menus of GTK applications: most of the apps on GNOME, Xfce, Cinnamon and tiling window managers. A theme installed in your home folder (~/.themes or ~/.local/share/themes) only affects your user and can be removed by deleting its folder; a system-wide install in /usr/share/themes needs sudo.',
      'GTK4 apps built with libadwaita, which includes most GNOME apps, ignore classic GTK themes by default. Some themes below ship a libadwaita variant or an install option for it, and adw-gtk3 goes the other way, giving older GTK3 apps the libadwaita look so everything matches.',
    ],
    choose: [
      'Check GTK4 and libadwaita support if you use recent GNOME apps.',
      'Pick a theme from the same family as your icons and terminal palette (Nord, Gruvbox, Catppuccin…) for a consistent desktop.',
      'Prefer a user install: it needs no sudo and is undone by removing one folder.',
    ],
    faq: [
      {
        q: 'Why does my GTK theme not apply to GNOME apps?',
        a: 'Apps built with libadwaita use their own stylesheet and ignore the GTK theme setting. Themes that support libadwaita install a gtk.css into ~/.config/gtk-4.0; otherwise those apps keep the default look.',
      },
      {
        q: 'How do I set a GTK theme on Hyprland or Sway?',
        a: 'Use a settings app such as nwg-look, or set it directly with gsettings set org.gnome.desktop.interface gtk-theme followed by the theme name. Both write the setting GTK applications read.',
      },
      {
        q: 'Should I install a theme for my user or for the whole system?',
        a: 'For your user, unless several accounts need it. A user install stays in your home folder, needs no sudo and is easy to remove.',
      },
    ],
  },
  {
    slug: 'icon-themes',
    label: 'Icon themes',
    facet: { kind: 'category', value: 'icons' },
    updated: '2026-10-25',
    title: 'Linux Icon Themes: Previews & Safe Install',
    h1: 'Linux icon themes, compared',
    description: '{n} Linux icon themes with previews: Papirus, Tela, WhiteSur, Colloid, Candy and more, compared by maintenance and what each install changes.',
    intro: [
      'An icon theme replaces the application, folder and status icons across your desktop. What matters most is coverage: a theme with icons for few apps falls back to another theme for the rest, which mixes styles. Large themes such as Papirus cover thousands of applications; smaller ones focus on a look.',
      'Icon themes install into ~/.local/share/icons for your user or /usr/share/icons for everyone, and you switch between them in your desktop settings, with nwg-look, or with gsettings. Some entries are add-ons rather than full themes, like Catppuccin Papirus Folders, which recolors Papirus folders.',
    ],
    choose: [
      'Favor coverage if you use many third-party apps; favor style if you keep a small, curated set.',
      'Match the icon theme to your GTK theme family for a consistent look.',
      'A user install needs no sudo and is removed by deleting one folder.',
    ],
    faq: [
      {
        q: 'Why do some apps keep their old icon?',
        a: 'The theme has no icon for that app, so the desktop uses the theme it inherits from. Themes with larger coverage, or an extension set like MoreWaita for Adwaita, reduce the gaps.',
      },
      {
        q: 'How do I change the icon theme outside GNOME and KDE?',
        a: 'Use nwg-look, or run gsettings set org.gnome.desktop.interface icon-theme followed by the theme name. GTK apps read this setting on any window manager.',
      },
      {
        q: 'Where are icon themes installed?',
        a: 'In ~/.local/share/icons for your user, or /usr/share/icons system-wide. Each theme is one folder named after it.',
      },
    ],
  },
  {
    slug: 'launchers',
    label: 'Launchers',
    facet: { kind: 'category', value: 'launcher' },
    updated: '2026-10-25',
    title: 'App Launchers for Linux: rofi, fuzzel & More',
    h1: 'Linux app launchers, compared',
    description: '{n} application launchers for Linux: rofi, fuzzel, tofi, Walker, Anyrun, Ulauncher and more, compared by Wayland or X11 support and maintenance.',
    intro: [
      'On a tiling window manager, the launcher is how you open everything: a keyboard shortcut brings up a search box, you type a few letters, and the app starts. Launchers fall into two families. dmenu-style menus like rofi, fuzzel, tofi and bemenu are minimal, fast and scriptable, and are also used for power menus and clipboard pickers. Spotlight-style launchers like Ulauncher, Albert, Cerebro, Walker and Anyrun add plugins for calculations, web search and more.',
      'The display server decides a lot: fuzzel, tofi, Walker and Anyrun are Wayland-only, while some launchers were written for X11. The "Works with" column shows which is which.',
    ],
    choose: [
      'Check Wayland or X11 support first.',
      'Want menus for your own scripts too? Pick a dmenu-style launcher.',
      'Want plugins and a graphical search? Pick a Spotlight-style launcher.',
    ],
    faq: [
      {
        q: 'Does rofi work on Wayland?',
        a: 'Use the Wayland fork listed here, which adds layer-shell support for Wayland compositors. Wayland-native alternatives include fuzzel, tofi, Walker and Anyrun.',
      },
      {
        q: 'What is the difference between dmenu and rofi?',
        a: 'dmenu is a minimal menu that reads a list and prints the choice. rofi is a richer replacement with window switching, application search and themes, and it can still act as a dmenu for scripts.',
      },
      {
        q: 'Can a launcher replace the GNOME or KDE app search?',
        a: 'Yes. Spotlight-style launchers such as Ulauncher or Albert run on full desktops too; you bind them to a shortcut of your choice.',
      },
    ],
  },
  {
    slug: 'bars',
    label: 'Status bars',
    facet: { kind: 'category', value: 'bar' },
    updated: '2026-10-25',
    title: 'Linux Status Bars: Waybar, Polybar & Alternatives',
    h1: 'Linux status bars and panels, compared',
    description: '{n} status bars and panels for Linux: Waybar, Polybar, HyprPanel, Ironbar, tint2 and more, compared by Wayland or X11 support and maintenance.',
    intro: [
      'Tiling window managers do not come with a panel, so you add a status bar: workspaces, clock, battery, network, audio and a tray. Waybar is the usual choice on Wayland compositors such as Hyprland and Sway; Polybar plays the same role on X11 window managers like i3 and bspwm.',
      'Beyond those two, the options trade features for weight. HyprPanel is an all-in-one panel for Hyprland with dashboards and notifications; Ironbar, gBar and nwg-panel are GTK-based; yambar and lemonbar are minimal; tint2 is the classic Openbox panel. Bars built into full desktop shells are listed with dotfiles and widgets instead.',
    ],
    choose: [
      'Match the display server: Wayland bars do not run on X11 and the other way round.',
      'Pick by config format: Waybar uses JSON and CSS, Polybar an INI file, lemonbar reads text from a script.',
      'Compositor-specific bars like HyprPanel offer more, but only on that compositor.',
    ],
    faq: [
      {
        q: 'Waybar or Polybar?',
        a: 'Waybar for Wayland compositors (Hyprland, Sway, river…), Polybar for X11 window managers (i3, bspwm, Openbox…). They fill the same role on different display servers.',
      },
      {
        q: 'Does Waybar work on GNOME?',
        a: 'No. Waybar needs a compositor with the layer-shell protocol, which GNOME Shell does not provide. GNOME users change the panel with extensions such as Dash to Panel.',
      },
      {
        q: 'Why is my bar empty or missing icons?',
        a: 'Most bars use a Nerd Font or icon font for their symbols. Install the font named in the setup’s instructions, then restart the bar.',
      },
    ],
  },
  {
    slug: 'gnome',
    label: 'GNOME',
    facet: { kind: 'wm', value: 'gnome' },
    updated: '2026-10-25',
    title: 'GNOME Extensions & Themes, Compared',
    h1: 'GNOME extensions and themes, compared',
    description: '{n} GNOME Shell extensions and themes: tiling, blur, taskbar, live wallpapers and more, with GNOME version notes, maintenance and install impact.',
    intro: [
      'GNOME is customized mostly through Shell extensions: small add-ons that run inside GNOME Shell. They can add tiling (Tiling Shell, PaperWM), merge the dash and top bar into a taskbar (Dash to Panel), blur the panel and overview (Blur my Shell), play video wallpapers (Hanabi) or animate windows (Burn My Windows). Extension Manager lets you browse and install them in a native app.',
      'Because extensions run inside the shell, each one supports specific GNOME versions. After a major GNOME upgrade, an extension may be disabled until its author releases an update, so the Maintenance column is worth a look.',
    ],
    choose: [
      'Check that the extension supports your GNOME version before installing.',
      'Install a few at a time: if the shell misbehaves, you know which one to disable.',
      'For tiling, compare Tiling Shell (snap layouts) with PaperWM (scrolling columns).',
    ],
    faq: [
      {
        q: 'How do I disable a GNOME extension that breaks my desktop?',
        a: 'Open the Extensions app or Extension Manager and switch it off, or run gnome-extensions disable followed by the extension’s UUID from a terminal or a TTY.',
      },
      {
        q: 'Why did my extensions turn off after upgrading GNOME?',
        a: 'GNOME disables extensions that do not declare support for the new version. They come back once their authors publish an update.',
      },
      {
        q: 'Can GNOME do tiling like a tiling window manager?',
        a: 'With extensions, yes. Tiling Shell adds Windows 11 style snap layouts and tiling; PaperWM arranges windows in scrollable columns.',
      },
    ],
  },
  {
    slug: 'catppuccin',
    label: 'Catppuccin',
    facet: { kind: 'style', value: 'catppuccin' },
    updated: '2026-10-25',
    title: 'Catppuccin for Linux: GTK, Cursors, GRUB & More',
    h1: 'Catppuccin for the Linux desktop',
    description: '{n} Catppuccin ports and setups for Linux: GTK, cursors, icons, GRUB, SDDM and Hyprland, with maintenance status and what each install changes.',
    intro: [
      'Catppuccin is a pastel color palette with four flavors, from the light Latte to the dark Frappé, Macchiato and Mocha, and a set of accent colors. Its organization maintains official ports for hundreds of applications, which makes it one of the easiest ways to give a whole Linux desktop one consistent look.',
      'This page collects the Catppuccin ports for the desktop itself, from the bootloader and login screen to cursors, icons, GTK and Hyprland, plus complete setups built around the palette. Check the Maintenance column: some ports have been archived upstream.',
    ],
    choose: [
      'Pick one flavor and one accent and use them everywhere; most ports offer all of them.',
      'Start with the parts you see most: terminal, GTK theme, cursors and icons.',
      'GRUB and login screen themes change system files and need sudo: read their steps first.',
    ],
    faq: [
      {
        q: 'Which Catppuccin flavor should I use?',
        a: 'Latte is the light flavor; Frappé, Macchiato and Mocha get progressively darker. Mocha is the most common choice for dark setups.',
      },
      {
        q: 'Is the Catppuccin GTK theme still maintained?',
        a: 'Its upstream repository is archived, as shown on its page. It may keep working, but it will not get fixes; the other ports listed here are separate projects with their own status.',
      },
      {
        q: 'Where do I find Catppuccin for my other apps?',
        a: 'The central Catppuccin repository links to the ports for hundreds of applications, from terminals and editors to browsers.',
      },
    ],
  },
  {
    slug: 'login-managers',
    label: 'Login screens',
    facet: { kind: 'category', value: 'login' },
    updated: '2026-10-25',
    title: 'Linux Login Screens: SDDM Themes & Greeters',
    h1: 'Linux login screens: SDDM themes and greeters',
    description: '{n} Linux login screens: SDDM themes, greetd greeters such as tuigreet and ReGreet, and Ly, with what each changes on your system and how to recover.',
    intro: [
      'The login screen comes from a display manager: SDDM (the KDE default), GDM (GNOME), LightDM, Ly, or greetd with a greeter on top. Some entries here are themes for an existing display manager, like the SDDM themes; others replace the display manager itself, like Ly, or provide a greeter for greetd, like tuigreet, ReGreet and nwg-hello.',
      'Both kinds change system files and need sudo, and switching display managers changes which service starts at boot. Read the steps before running them, and know how to reach a text console in case the new login screen does not start.',
    ],
    choose: [
      'Already on SDDM? A theme is the smallest change.',
      'Want something minimal? Ly or tuigreet run in the console with almost no dependencies.',
      'On a Wayland-only setup, a greetd greeter avoids pulling in a full display manager.',
    ],
    faq: [
      {
        q: 'What is the difference between a display manager and a greeter?',
        a: 'The display manager starts your session after you log in; the greeter is the screen where you type your password. greetd is a display manager that leaves the interface to a separate greeter.',
      },
      {
        q: 'What if my new login screen does not start?',
        a: 'Switch to a text console with Ctrl+Alt+F2 (or F3), log in, and re-enable your previous display manager with systemctl, then reboot.',
      },
      {
        q: 'Do SDDM themes work without KDE?',
        a: 'Yes. SDDM runs with any desktop or window manager; the theme only changes the login screen.',
      },
    ],
  },
  {
    slug: 'kde-plasma',
    label: 'KDE Plasma',
    facet: { kind: 'wm', value: 'kde' },
    updated: '2026-10-25',
    title: 'KDE Plasma Extensions & KWin Scripts',
    h1: 'KDE Plasma extensions and KWin scripts, compared',
    description: '{n} KDE Plasma add-ons: tiling KWin scripts, rounded corners, panel styling and a HUD, with Plasma 6 support, maintenance and install impact.',
    intro: [
      'KDE Plasma is customizable through its settings, and further through add-ons: KWin scripts that change how windows behave, KWin effects, and Plasma widgets. The entries here add automatic tiling (Krohnkite, Polonium, Bismuth), round window corners, restyle panels and bring a Unity-style menu search.',
      'The Plasma version matters. Plasma 6 changed the APIs that scripts and effects use, so an add-on written for Plasma 5 may not load on Plasma 6. Compiled effects such as rounded corners must also be rebuilt when KWin is updated.',
    ],
    choose: [
      'Check Plasma 6 support: Bismuth, for example, only targets Plasma 5.',
      'For tiling on Plasma 6, compare Krohnkite and Polonium.',
      'Compiled KWin effects need rebuilding after Plasma updates; scripts and widgets do not.',
    ],
    faq: [
      {
        q: 'Can KDE Plasma tile windows automatically?',
        a: 'Plasma has basic built-in tiling; KWin scripts such as Krohnkite and Polonium add automatic tiling layouts similar to a tiling window manager.',
      },
      {
        q: 'Why did an add-on stop working after a Plasma update?',
        a: 'Scripts and effects depend on KWin’s internals. Plasma 6 broke many Plasma 5 add-ons, and compiled effects must be rebuilt for each KWin release.',
      },
      {
        q: 'How do I remove a KWin script?',
        a: 'Disable it in System Settings under Window Management, then remove it from the same page or delete its folder in ~/.local/share/kwin/scripts.',
      },
    ],
  },
  {
    slug: 'notification-daemons',
    label: 'Notifications',
    facet: { kind: 'category', value: 'notifications' },
    updated: '2026-10-25',
    title: 'Linux Notification Daemons Compared',
    h1: 'Linux notification daemons, compared',
    description: '{n} Linux notification daemons: dunst, mako, fnott, SwayNotificationCenter and more, compared by Wayland or X11 support and maintenance.',
    intro: [
      'GNOME and KDE show notifications themselves, but a standalone window manager needs a notification daemon: the program that receives messages from apps and draws the pop-ups. Only one daemon can own the notification service at a time, so installing a second one usually means stopping the first.',
      'Some daemons only show pop-ups, like mako, fnott and dunst; others add a notification center with history and quick toggles, like SwayNotificationCenter on Wayland and Deadd on X11.',
    ],
    choose: [
      'Match the display server: mako and fnott are Wayland-only, Deadd and Wired are X11-only, dunst handles both.',
      'Want history and toggles? Pick a notification center.',
      'Keep one daemon running at a time.',
    ],
    faq: [
      {
        q: 'Why do notifications not appear on my window manager?',
        a: 'No notification daemon is running. Install one and start it from your window manager’s autostart.',
      },
      {
        q: 'Why do I get the wrong notification style?',
        a: 'Another daemon started first and took over the notification service. Remove it from autostart so only your chosen daemon runs.',
      },
      {
        q: 'dunst or mako?',
        a: 'Both are lightweight and configured with a text file. mako is Wayland-only; dunst runs on Wayland and X11.',
      },
    ],
  },
  {
    slug: 'awesomewm',
    label: 'AwesomeWM',
    facet: { kind: 'wm', value: 'awesome' },
    updated: '2026-10-25',
    title: 'AwesomeWM Dotfiles & Rices, Compared',
    h1: 'AwesomeWM dotfiles and rices, compared',
    description: '{n} AwesomeWM rices with Lua widgets, dashboards and custom palettes, compared by install impact, maintenance and what you need to run them.',
    intro: [
      'AwesomeWM is an X11 window manager configured entirely in Lua. Its config can build anything from a bar to a full dashboard, which is why AwesomeWM rices are among the most polished on r/unixporn: the widgets are written by hand rather than assembled from separate programs.',
      'Many of these setups rely on features that only exist in the development version of AwesomeWM, often packaged as awesome-git, rather than the last stable release. Check each setup’s instructions before installing.',
    ],
    choose: [
      'Check whether the setup needs awesome-git.',
      'AwesomeWM runs on X11 only; you need an X11 session.',
      'Fonts and icon fonts are part of the look: install the ones each setup names.',
    ],
    faq: [
      {
        q: 'Does AwesomeWM work on Wayland?',
        a: 'No, AwesomeWM is an X11 window manager. It runs in an X11 session.',
      },
      {
        q: 'Do I need awesome-git?',
        a: 'Often, yes: many modern rices use features added after the last stable release. Each setup’s README says which version it needs.',
      },
      {
        q: 'Where is the AwesomeWM config?',
        a: 'In ~/.config/awesome, starting from rc.lua. Back up that folder before trying another setup.',
      },
    ],
  },
  {
    slug: 'cursor-themes',
    label: 'Cursor themes',
    facet: { kind: 'category', value: 'cursors' },
    updated: '2026-10-25',
    title: 'Linux Cursor Themes: Previews & Safe Install',
    h1: 'Linux cursor themes, compared',
    description: '{n} Linux cursor themes: Bibata, Catppuccin, macOS, Google and Vimix cursors, compared by maintenance and what each install changes.',
    intro: [
      'A cursor theme is a small change that shows everywhere. Cursor themes install like icon themes, into ~/.local/share/icons or /usr/share/icons, and each comes in sizes and often in color variants.',
      'Getting the same cursor in every app takes two settings on most setups: the GTK setting, through your desktop settings, nwg-look or gsettings, and the XCURSOR_THEME and XCURSOR_SIZE environment variables for everything else, including Xwayland apps on Wayland compositors.',
    ],
    choose: [
      'Pick a variant that matches your theme’s light or dark mode.',
      'Choose a size that fits your display scaling; many themes ship several.',
      'A user install needs no sudo and is undone by deleting one folder.',
    ],
    faq: [
      {
        q: 'Why is my cursor different in some apps?',
        a: 'Those apps read another setting. Set the cursor theme in your GTK settings and in the XCURSOR_THEME and XCURSOR_SIZE environment variables, then log out and back in.',
      },
      {
        q: 'Where are cursor themes installed?',
        a: 'Alongside icon themes, in ~/.local/share/icons for your user or /usr/share/icons system-wide.',
      },
      {
        q: 'How do I set the cursor on Hyprland?',
        a: 'Set the XCURSOR_THEME and XCURSOR_SIZE environment variables in your Hyprland config, and the GTK cursor theme with nwg-look or gsettings.',
      },
    ],
  },
];
