#!/usr/bin/env ruby
# Sanity check of an Xcode project file on any machine (no Xcode needed): prints the objectVersion, then checks that the file parses and that every
# object the file points to exists (no dangling ids), every target has build configurations, and no file reference points at a path that is
# clearly machine specific. Exit 1 with a list of problems.   ruby native/check-pbxproj.rb ios/App/App.xcodeproj
require 'xcodeproj'
path = ARGV[0] || 'ios/App/App.xcodeproj'
file = File.join(path, 'project.pbxproj')
abort("no such file: #{file}") unless File.exist?(file)
plist = Xcodeproj::Plist.read_from_path(file)
objs = plist['objects']
puts "pbxproj: objectVersion=#{plist['objectVersion']} archiveVersion=#{plist['archiveVersion']} objects=#{objs.size} rootObject=#{plist['rootObject']} (xcodeproj gem #{Xcodeproj::VERSION})"
problems = []
problems << 'rootObject missing' unless objs[plist['rootObject']]
id_like = ->(v) { v.is_a?(String) && v =~ /\A[0-9A-F]{24}\z/ }
objs.each do |id, o|
  o.each do |k, v|
    next if %w[remoteGlobalIDString].include?(k)   # id inside another project/object, checked below
    vals = v.is_a?(Array) ? v : [v]
    vals.each do |x|
      next unless id_like.call(x)
      problems << "#{o['isa']} #{id} (#{o['name'] || o['path']}) → #{k}: #{x} does not exist" unless objs[x]
    end
  end
  if o['isa'] == 'PBXContainerItemProxy' && o['proxyType'].to_s == '1' && o['containerPortal'] == plist['rootObject']
    problems << "proxy #{id}: remoteGlobalIDString #{o['remoteGlobalIDString']} is not a target" unless objs[o['remoteGlobalIDString']] && objs[o['remoteGlobalIDString']]['isa'] == 'PBXNativeTarget'
  end
  if o['isa'] == 'PBXNativeTarget'
    cl = objs[o['buildConfigurationList']]
    problems << "target #{o['name']}: no build configuration list" unless cl && !cl['buildConfigurations'].to_a.empty?
    problems << "target #{o['name']}: product reference missing" if o['productType'] =~ /application/ && !objs[o['productReference']]
  end
  if o['isa'] == 'PBXFileReference' && o['path'].to_s =~ %r{\.sdk/}
    problems << "file reference #{o['name'] || o['path']} points into a specific SDK version: #{o['path']}"
  end
end
# every object must be reachable from the root (an orphan is harmless, but is a sign something was half removed)
seen = {}
walk = lambda do |id|
  next if seen[id] || !objs[id]
  seen[id] = true
  objs[id].each { |k, v| (v.is_a?(Array) ? v : [v]).each { |x| walk.call(x) if id_like.call(x) } }
end
walk.call(plist['rootObject'])
orphans = objs.keys.reject { |i| seen[i] }
puts "pbxproj: #{orphans.size} unreferenced object(s)#{orphans.empty? ? '' : ': ' + orphans.first(5).map { |i| objs[i]['isa'] }.join(', ')}"
# open it the way the gem does and list the targets
proj = Xcodeproj::Project.open(path)
puts "pbxproj: targets: " + proj.targets.map { |t| "#{t.name} [#{t.build_configurations.map { |c| c.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] }.uniq.join(',')}] sdk=#{t.build_configurations.first.build_settings['SDKROOT']}" }.join('; ')
if problems.empty?
  puts 'pbxproj: no problems found'
else
  puts 'pbxproj PROBLEMS:'; problems.each { |m| puts '  - ' + m }
  exit 1
end
