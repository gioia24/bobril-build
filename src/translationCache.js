var fs = require('fs');
var pathPlatformDependent = require("path");
var path = pathPlatformDependent.posix; // This works everythere, just use forward slashes
var pathUtils = require("./pathUtils");
var indexOfLangsMessages = 4;
var TranslationDb = (function () {
    function TranslationDb() {
        this.clear();
    }
    TranslationDb.prototype.clear = function () {
        this.db = Object.create(null);
        this.langs = [];
        this.usedKeyList = [];
        this.temporaryKeyList = [];
    };
    TranslationDb.prototype.addLang = function (name) {
        var pos = this.langs.indexOf(name);
        if (pos >= 0)
            return pos;
        this.langs.push(name);
        return this.langs.length - 1;
    };
    TranslationDb.prototype.buildKey = function (message, hint, hasParams) {
        return message + '\x01\x02' + (hasParams ? '#' : '-') + (hint || '');
    };
    TranslationDb.prototype.loadLangDbs = function (dir) {
        var _this = this;
        var trFiles;
        try {
            trFiles = fs.readdirSync(dir).filter(function (v) { return /\.json$/i.test(v); });
        }
        catch (err) {
            // ignore errors
            return;
        }
        trFiles.forEach(function (v) {
            _this.loadLangDb(path.join(dir, v));
        });
    };
    TranslationDb.prototype.loadLangDb = function (fileName) {
        var json = JSON.parse(fs.readFileSync(fileName, 'utf-8'));
        if (!Array.isArray(json))
            throw new Error('root object is not array');
        if (json.length === 0)
            throw new Error('array cannot be empty');
        var lang = json[0];
        if (typeof lang !== 'string')
            throw new Error('first item must be string');
        var langidx = indexOfLangsMessages + this.addLang(lang);
        for (var i = 1; i < json.length; i++) {
            var item = json[i];
            if (!Array.isArray(item))
                throw new Error('items must be array');
            if (item.length !== 3 || item.length !== 4)
                throw new Error('items must have length==3 or 4');
            var message = item[0];
            var hint = item[1];
            var flags = item[2];
            if (typeof message !== 'string')
                throw new Error('item[0] must be message string');
            if (hint != null && typeof hint !== 'string')
                throw new Error('item[1] must be hint string or null');
            if (typeof flags !== 'number')
                throw new Error('item[2] must be flags number');
            var key = this.buildKey(item[0], item[1], (item[2] & 1) !== 0);
            var tr = this.db[key];
            if (tr) {
                if (item.length === 4) {
                    tr[langidx] = item[3];
                }
            }
            else {
                tr = [message, hint, flags, null];
                if (item.length === 4) {
                    tr[langidx] = item[3];
                }
                this.db[key] = tr;
            }
        }
    };
    TranslationDb.prototype.removeLang = function (lang) {
        var pos = this.langs.indexOf(lang);
        if (pos < 0)
            return;
        pos += indexOfLangsMessages;
        for (var key in this.db) {
            var tr = this.db[key];
            tr.splice(pos, 1);
        }
    };
    TranslationDb.prototype.saveLangDbs = function (dir) {
        var _this = this;
        pathUtils.mkpathsync(dir);
        this.langs.forEach(function (lang) {
            _this.saveLangDb(path.join(dir, lang + ".json"), lang);
        });
    };
    TranslationDb.prototype.saveLangDb = function (filename, lang) {
        var pos = this.langs.indexOf(lang);
        if (pos < 0)
            pos = this.langs.length;
        pos += indexOfLangsMessages;
        var items = [lang];
        for (var key in this.db) {
            var tr = this.db[key];
            var trl = tr[pos];
            if (trl != null) {
                items.push([tr[0], tr[1], tr[2] & 1, trl]);
            }
            else {
                items.push([tr[0], tr[1], tr[2] & 1]);
            }
        }
        fs.writeFileSync(filename, JSON.stringify(items));
    };
    TranslationDb.prototype.addUsageOfMessage = function (info) {
        var key = this.buildKey(info.message, info.hint, info.withParams);
        var item = this.db[key];
        if (item === undefined) {
            item = [info.message, info.hint, (info.withParams ? 1 : 0) | 2 | 4, this.usedKeyList.length]; // add as temporary and as used
            this.db[key] = item;
            this.usedKeyList.push(key);
            this.temporaryKeyList.push(key);
        }
        else {
            if ((item[2] & 4) === 0) {
                item[2] = item[2] | 4; // add used flag
                item[3] = this.usedKeyList.length;
                this.usedKeyList.push(key);
            }
        }
        return item[3];
    };
    TranslationDb.prototype.clearUsedFlags = function () {
        var list = this.usedKeyList;
        var db = this.db;
        for (var i = 0; i < list.length; i++) {
            var item = db[list[i]];
            item[2] = item[2] & ~4;
        }
        list.length = 0;
    };
    TranslationDb.prototype.clearTemporaryFlags = function () {
        var list = this.temporaryKeyList;
        var db = this.db;
        for (var i = 0; i < list.length; i++) {
            var item = db[list[i]];
            item[2] = item[2] & ~2;
        }
        list.length = 0;
    };
    TranslationDb.prototype.pruneDbOfTemporaryUnused = function () {
        var list = this.temporaryKeyList;
        var db = this.db;
        for (var i = 0; i < list.length; i++) {
            var key = list[i];
            var item = db[key];
            if ((item[2] & 4) === 0) {
                delete db[key];
                list.splice(i, 1);
                i--;
            }
        }
    };
    TranslationDb.prototype.getTemporaryStringsCount = function () {
        return this.temporaryKeyList.length;
    };
    TranslationDb.prototype.getMessageArrayInLang = function (lang) {
        var pos = this.langs.indexOf(lang);
        if (pos < 0)
            pos = this.langs.length;
        pos += indexOfLangsMessages;
        var result = [];
        var list = this.usedKeyList;
        var db = this.db;
        for (var i = 0; i < list.length; i++) {
            var item = db[list[i]];
            if (item[pos] != null) {
                result.push(item[pos]);
            }
            else {
                result.push(item[0]); // English as fallback
            }
        }
        return result;
    };
    TranslationDb.prototype.getForTranslationLang = function (lang) {
        var pos = this.langs.indexOf(lang);
        if (pos < 0)
            pos = this.langs.length;
        pos += indexOfLangsMessages;
        var result = [];
        var list = this.usedKeyList;
        var db = this.db;
        for (var i = 0; i < list.length; i++) {
            var item = db[list[i]];
            if (item[pos] != null)
                continue;
            result.push([null, item[0], item[1], item[2] & 1, list[i]]);
        }
        return result;
    };
    TranslationDb.prototype.setForTranslationLang = function (lang, trs) {
        var pos = this.langs.indexOf(lang);
        if (pos < 0)
            pos = this.langs.length;
        pos += indexOfLangsMessages;
        var db = this.db;
        for (var i = 0; i < trs.length; i++) {
            var row = trs[i];
            if (typeof row[0] !== 'string')
                continue;
            var item = db[row[4]];
            item[pos] = row[0];
        }
    };
    return TranslationDb;
})();
exports.TranslationDb = TranslationDb;
