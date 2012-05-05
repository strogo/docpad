// Generated by CoffeeScript 1.3.1
(function() {
  var PluginLoader, balUtil, coffee, fs, path, semver, _,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  path = require('path');

  fs = require('fs');

  _ = require('underscore');

  semver = require('semver');

  balUtil = require('bal-util');

  coffee = require('coffee-script');

  PluginLoader = (function() {

    PluginLoader.name = 'PluginLoader';

    PluginLoader.prototype.docpad = null;

    PluginLoader.prototype.BasePlugin = null;

    PluginLoader.prototype.dirPath = null;

    PluginLoader.prototype.packagePath = null;

    PluginLoader.prototype.packageData = {};

    PluginLoader.prototype.pluginConfig = {};

    PluginLoader.prototype.pluginPath = null;

    PluginLoader.prototype.pluginClass = {};

    PluginLoader.prototype.pluginName = null;

    PluginLoader.prototype.nodeModulesPath = null;

    function PluginLoader(_arg) {
      this.docpad = _arg.docpad, this.dirPath = _arg.dirPath, this.BasePlugin = _arg.BasePlugin;
      this.pluginName = path.basename(this.dirPath).replace(/^docpad-plugin-/, '');
      this.pluginClass = {};
      this.pluginConfig = {};
      this.packageData = {};
      this.nodeModulesPath = path.resolve(this.dirPath, 'node_modules');
    }

    PluginLoader.prototype.exists = function(next) {
      var packagePath, pluginPath,
        _this = this;
      packagePath = path.resolve(this.dirPath, "package.json");
      pluginPath = path.resolve(this.dirPath, "" + this.pluginName + ".plugin.coffee");
      path.exists(packagePath, function(exists) {
        if (!exists) {
          return path.exists(pluginPath, function(exists) {
            if (!exists) {
              return typeof next === "function" ? next(null, false) : void 0;
            } else {
              _this.pluginPath = pluginPath;
              return typeof next === "function" ? next(null, true) : void 0;
            }
          });
        } else {
          _this.packagePath = packagePath;
          return balUtil.readFile(packagePath, function(err, data) {
            if (err) {
              return typeof next === "function" ? next(err, false) : void 0;
            } else {
              try {
                _this.packageData = JSON.parse(data.toString());
              } catch (err) {
                return typeof next === "function" ? next(err, false) : void 0;
              }
              if (!_this.packageData) {
                return typeof next === "function" ? next(null, false) : void 0;
              }
              _this.pluginConfig = _this.packageData.docpad && _this.packageData.docpad.plugin || {};
              pluginPath = (_this.packageData.main != null) && path.join(_this.dirPath, _this.pluginPath) || pluginPath;
              return path.exists(pluginPath, function(exists) {
                if (!exists) {
                  return typeof next === "function" ? next(null, false) : void 0;
                } else {
                  _this.pluginPath = pluginPath;
                  return typeof next === "function" ? next(null, true) : void 0;
                }
              });
            }
          });
        }
      });
      return this;
    };

    PluginLoader.prototype.unsupported = function(next) {
      var engines, keywords, platforms, unsupported, _ref;
      unsupported = false;
      if (this.packageData) {
        keywords = this.packageData.keywords || [];
        if (__indexOf.call(keywords, 'docpad-plugin') < 0) {
          unsupported = 'type';
        }
      }
      if (this.packageData && this.packageData.platforms) {
        platforms = this.packageData.platforms || [];
        if (_ref = process.platform, __indexOf.call(platforms, _ref) < 0) {
          unsupported = 'platform';
        }
      }
      if (this.packageData && this.packageData.engines) {
        engines = this.packageData.engines || {};
        if (engines.node != null) {
          if (!semver.satisfies(process.version, engines.node)) {
            unsupported = 'engine';
          }
        }
        if (engines.docpad != null) {
          if (!semver.satisfies(this.docpad.version, engines.docpad)) {
            unsupported = 'version';
          }
        }
      }
      if (typeof next === "function") {
        next(null, unsupported);
      }
      return this;
    };

    PluginLoader.prototype.install = function(next) {
      var docpad;
      docpad = this.docpad;
      if (this.packagePath) {
        docpad.initNodeModules({
          path: this.dirPath,
          next: function(err, results) {
            return typeof next === "function" ? next(err) : void 0;
          }
        });
      } else {
        if (typeof next === "function") {
          next();
        }
      }
      return this;
    };

    PluginLoader.prototype.load = function(next) {
      try {
        this.pluginClass = require(this.pluginPath)(this.BasePlugin);
        if (typeof next === "function") {
          next(null, this.pluginClass);
        }
      } catch (err) {
        if (typeof next === "function") {
          next(err, null);
        }
      }
      return this;
    };

    PluginLoader.prototype.create = function(userConfiguration, next) {
      var config, docpadConfiguration, pluginInstance;
      if (userConfiguration == null) {
        userConfiguration = {};
      }
      try {
        docpadConfiguration = this.docpad.config.plugins[this.pluginName] || {};
        config = _.extend({}, this.pluginConfig, docpadConfiguration, userConfiguration);
        config.docpad = this.docpad;
        pluginInstance = new this.pluginClass(config);
        if (typeof next === "function") {
          next(null, pluginInstance);
        }
      } catch (err) {
        if (typeof next === "function") {
          next(err, null);
        }
      }
      return this;
    };

    return PluginLoader;

  })();

  module.exports = PluginLoader;

}).call(this);