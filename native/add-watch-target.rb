#!/usr/bin/env ruby
# Adds the StrokeWise Apple Watch app to the generated iPhone Xcode project (ios/App/App.xcodeproj) and embeds it in the iPhone app.
# Run by native/ios-setup.sh on the build Mac when STROKEWISE_WATCH=1 (the ios-testflight-watch workflow). Uses the xcodeproj gem
# (it comes with CocoaPods, which Codemagic's Macs have).
#
#   ruby native/add-watch-target.rb                      add the watch target, embed it, link the bridge into AppDelegate
#   ruby native/add-watch-target.rb --set-version 1.0 42 set MARKETING_VERSION / CURRENT_PROJECT_VERSION on every target
#   ruby native/add-watch-target.rb --ensure-embed     make sure StrokeWise.app is copied into App.app/Watch
#   ruby native/add-watch-target.rb --no-phone-healthkit  take the HealthKit entitlement off the iPhone app again (used by native/check-phone-healthkit.sh
#                                                         when the iPhone app's signing profile has no HealthKit; the watch app is not auto-launched then)
#
# What it builds: a watchOS app target "StrokewiseWatch" (product StrokeWise.app, bundle id com.strokewise.app.watchkitapp, watchOS 9+),
# sources from native/watch/StrokewiseWatch, copied to ios/App/StrokewiseWatch; an "Embed Watch Content" copy phase in the App target
# (into App.app/Watch) and a target dependency, which is what makes the watch app part of the iPhone app's IPA.
require 'xcodeproj'
require 'fileutils'

ROOT = File.expand_path('..', __dir__)
IOS = File.join(ROOT, 'ios', 'App')
PROJECT = File.join(IOS, 'App.xcodeproj')
SRC = File.join(ROOT, 'native', 'watch', 'StrokewiseWatch')
DEST = File.join(IOS, 'StrokewiseWatch')
WATCH_NAME = 'StrokewiseWatch'
WATCH_BUNDLE = 'com.strokewise.app.watchkitapp'

def set_versions(project, marketing, build)
  project.targets.each do |t|
    t.build_configurations.each do |c|
      c.build_settings['MARKETING_VERSION'] = marketing
      c.build_settings['CURRENT_PROJECT_VERSION'] = build.to_s
    end
  end
  project.save
  puts "versions set: #{marketing} (#{build}) on #{project.targets.map(&:name).join(', ')}"
end

# The watch target is named StrokewiseWatch but its product is StrokeWise.app. Copy it into
# the iPhone app at App.app/Watch (or whatever the iPhone product is named). SKIP_INSTALL
# must stay YES so the watch app is not exported as a second top-level app.
def ensure_embed(project)
  app = project.targets.find { |t| t.name == 'App' } or abort('App target not found')
  watch = project.targets.find { |t| t.name == WATCH_NAME } or abort('StrokewiseWatch target not found')
  watch.build_configurations.each do |c|
    c.build_settings['SKIP_INSTALL'] = 'YES'
  end
  unless app.dependencies.any? { |d| d.target && d.target.name == WATCH_NAME }
    app.add_dependency(watch)
    puts 'added App → StrokewiseWatch target dependency'
  end
  embed = app.copy_files_build_phases.find { |ph| ph.name == 'Embed Watch Content' }
  unless embed
    embed = app.new_copy_files_build_phase('Embed Watch Content')
    puts 'created Embed Watch Content phase'
  end
  embed.dst_subfolder_spec = '16' # Products Directory
  embed.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'
  already = embed.files.any? do |bf|
    ref = bf.file_ref
    ref && (ref == watch.product_reference || ref.path.to_s.include?('StrokeWise') || ref.path.to_s.include?(WATCH_NAME))
  end
  unless already
    build_file = embed.add_file_reference(watch.product_reference)
    build_file.settings = { 'ATTRIBUTES' => %w[CodeSignOnCopy RemoveHeadersOnCopy] }
    puts 'embedded StrokeWise.app (StrokewiseWatch product) into the iPhone app Watch folder'
  end
  project.save
  puts "watch embed ok: product StrokeWise.app → */Watch, SKIP_INSTALL=YES"
end

# AppDelegate: start WatchConnectivity as soon as the app launches (even in the background), before any web view exists.
# The imports/calls are behind canImport, so the iPhone app still builds if the plugin module is not visible from the App target.
def patch_app_delegate
  path = File.join(IOS, 'App', 'AppDelegate.swift')
  s = File.read(path)
  return puts('AppDelegate already linked to the watch bridge') if s.include?('StrokewiseWatchBridge')
  s = s.sub("import Capacitor\n", "import Capacitor\n#if canImport(StrokewiseWatchPlugin)\nimport StrokewiseWatchPlugin\n#endif\n")
  hook = "        #if canImport(StrokewiseWatchPlugin)\n        StrokewiseWatchBridge.shared.activate()\n        #endif\n"
  patched = s.sub(/(didFinishLaunchingWithOptions[^\n]*\{\n)/) { "#{$1}#{hook}" }
  abort('could not find didFinishLaunchingWithOptions in AppDelegate.swift') if patched == s
  File.write(path, patched)
  puts 'AppDelegate: watch bridge activated at launch'
end

# iPhone app: the HealthKit entitlement, which HKHealthStore.startWatchApp needs (it wakes the watch app when a round starts; see
# native/strokewise-watch-plugin StrokewiseWatchLauncher.swift). The two Health usage strings go into Info.plist in native/ios-setup.sh.
# This is only reached in the watch workflow (ios-testflight-watch); the normal ios-testflight build never runs this script.
# STROKEWISE_PHONE_HEALTHKIT=0 leaves it out. The App ID com.strokewise.app and its "Strokewise App Store" profile must have the HealthKit
# capability, or signing fails ("profile doesn't include the com.apple.developer.healthkit entitlement").
PHONE_ENTITLEMENTS = File.join(IOS, 'App', 'App.entitlements')
def phone_healthkit(project, on)
  app = project.targets.find { |t| t.name == 'App' } or abort('App target not found')
  if on
    unless File.exist?(PHONE_ENTITLEMENTS)
      File.write(PHONE_ENTITLEMENTS, <<~PLIST)
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
        \t<key>com.apple.developer.healthkit</key>
        \t<true/>
        \t<key>com.apple.developer.healthkit.access</key>
        \t<array/>
        </dict>
        </plist>
      PLIST
    end
    group = project.main_group['App']
    group.new_file('App.entitlements') if group && group.files.none? { |f| f.path == 'App.entitlements' }
    app.build_configurations.each { |c| c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements' }
    puts 'iPhone app: HealthKit entitlement added (App/App.entitlements)'
  else
    app.build_configurations.each { |c| c.build_settings.delete('CODE_SIGN_ENTITLEMENTS') }
    FileUtils.rm_f(PHONE_ENTITLEMENTS)
    puts 'iPhone app: HealthKit entitlement removed'
  end
  project.save
end

project = Xcodeproj::Project.open(PROJECT)

if ARGV[0] == '--no-phone-healthkit'
  phone_healthkit(project, false)
  exit 0
end

if ARGV[0] == '--ensure-embed'
  ensure_embed(project)
  exit 0
end

if ARGV[0] == '--set-version'
  set_versions(project, ARGV[1] || '1.0', ARGV[2] || '1')
  ensure_embed(project)
  exit 0
end

abort("watch sources not found: #{SRC}") unless Dir.exist?(SRC)
if project.targets.any? { |t| t.name == WATCH_NAME }
  puts 'watch target already present'
  phone_healthkit(project, true) unless ENV['STROKEWISE_PHONE_HEALTHKIT'] == '0'
  patch_app_delegate
  exit 0
end
app = project.targets.find { |t| t.name == 'App' } or abort('App target not found')

# 1. the sources, next to the generated project (ios/ is rebuilt from scratch on every build)
FileUtils.rm_rf(DEST)
FileUtils.cp_r(SRC, DEST)
icon_dir = File.join(IOS, 'App', 'Assets.xcassets', 'AppIcon.appiconset')
icon = Dir.glob(File.join(icon_dir, '*.png')).max_by { |f| File.size(f) }
if icon
  FileUtils.cp(icon, File.join(DEST, 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-1024.png'))
else
  warn 'WARNING: iPhone app icon not found – the watch app has no icon (App Store upload will complain)'
end

# 2. the target
watch = project.new_target(:application, WATCH_NAME, :watchos, '9.0', project.products_group, :swift, 'StrokeWise')
# new_target links Foundation.framework with a hard-coded SDK path (…/WatchOS26.0.sdk/…) that does not exist on a Mac with another Xcode: drop it
# (Swift links Foundation by itself when the code imports it)
watch.frameworks_build_phase.files.to_a.each(&:remove_from_project)
fw = project.main_group['Frameworks']
if fw
  fw.children.to_a.select { |c| c.respond_to?(:display_name) && c.display_name == 'watchOS' }.each(&:remove_from_project)
  fw.remove_from_project if fw.children.empty?
end
group = project.main_group.new_group(WATCH_NAME, WATCH_NAME)   # path relative to ios/App
Dir.glob(File.join(DEST, '*.swift')).sort.each do |f|
  ref = group.new_file(File.basename(f))
  watch.source_build_phase.add_file_reference(ref)
end
assets = group.new_file('Assets.xcassets')
watch.resources_build_phase.add_file_reference(assets)
group.new_file('Info.plist')
group.new_file('StrokewiseWatch.entitlements')

watch.build_configurations.each do |c|
  bs = c.build_settings
  bs['PRODUCT_BUNDLE_IDENTIFIER'] = WATCH_BUNDLE
  bs['PRODUCT_NAME'] = 'StrokeWise'
  bs['SDKROOT'] = 'watchos'
  bs['SUPPORTED_PLATFORMS'] = 'watchos watchsimulator'
  bs['TARGETED_DEVICE_FAMILY'] = '4'
  bs['WATCHOS_DEPLOYMENT_TARGET'] = '9.0'
  bs['SWIFT_VERSION'] = '5.0'
  bs['SKIP_INSTALL'] = 'YES'
  bs['INFOPLIST_FILE'] = "#{WATCH_NAME}/Info.plist"
  bs['GENERATE_INFOPLIST_FILE'] = 'NO'
  bs['CODE_SIGN_ENTITLEMENTS'] = "#{WATCH_NAME}/StrokewiseWatch.entitlements"
  bs['CODE_SIGN_STYLE'] = 'Automatic'
  bs['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  bs['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME'] = 'AccentColor'
  bs['MARKETING_VERSION'] = '1.0'
  bs['CURRENT_PROJECT_VERSION'] = '1'
  bs['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks']
  bs['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  bs['ENABLE_PREVIEWS'] = 'YES'
  bs.delete('IPHONEOS_DEPLOYMENT_TARGET')
end

# 3. embed it in the iPhone app: the App target depends on it and copies it into App.app/Watch
app.add_dependency(watch)
embed = app.new_copy_files_build_phase('Embed Watch Content')
embed.dst_subfolder_spec = '16'                       # Products Directory
embed.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'
build_file = embed.add_file_reference(watch.product_reference)
build_file.settings = { 'ATTRIBUTES' => %w[RemoveHeadersOnCopy] }

project.save
puts "watch target added: #{WATCH_NAME} (#{WATCH_BUNDLE}), embedded in App"
phone_healthkit(project, true) unless ENV['STROKEWISE_PHONE_HEALTHKIT'] == '0'
patch_app_delegate
