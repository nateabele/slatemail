// jshint esnext: true
// jshint ignore: start
'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

// jshint ignore: end

var fs = require('fs');
// for some reason, setting fs to fs-extra isn't recognized later in the execution...?
var fsx = require('fs-extra');
var db;
var indexedDB = window.indexedDB;
var promisifyAll = require('es6-promisify-all');
// var Promise = require('bluebird');

// careful. //console.log(mail_obj) may crash node-webkit with no errors. Perhaps because mail_objs may be huge.

promisifyAll(fsx);

var dbHandler = (function () {
	function dbHandler() {
		_classCallCheck(this, dbHandler);

		return this;
	}

	_createClass(dbHandler, [{
		key: 'addObjectStore',
		value: function addObjectStore(store_name, store_conf, cb) {
			// Convenience function for creating an object store manually
			if (db.objectStoreNames.contains(store_name)) {
				if (cb) cb(null, null);
			}
			var version = parseInt(db.version);
			db.close();
			var open_request = indexedDB.open('slatemail', version + 1);
			open_request.onupgradeneeded = function () {
				db = open_request.result;
				db.createObjectStore(store_name, store_conf);
			};
			open_request.onsuccess = function () {
				if (cb) cb(null, null);
			};
		}
	}, {
		key: 'deleteDB',
		value: function deleteDB(cb) {
			console.log('delete request');
			var req = indexedDB.deleteDatabase('slatemail');
			req.onsuccess = function () {
				console.log('Deleted database successfully');
				if (cb) cb();
			};
			req.onerror = function (err) {
				console.log('Couldn\'t delete database');
				if (cb) cb(err);
			};
			req.onblocked = function () {
				if (cb) cb('Couldn\'t delete database due to operation being blocked', null);
			};
		}
	}, {
		key: 'deleteEverything',
		value: function deleteEverything(cb) {
			console.log('deleting everything');
			Promise.all([this.deleteDBAsync(), this.deleteAllAttachmentsAsync()]).then(cb)['catch'](cb);
		}
	}, {
		key: 'deleteAllAttachments',
		value: function deleteAllAttachments(cb) {
			fsx.remove('attachments').then(cb)['catch'](cb);
		}
	}, {
		key: 'connect',
		value: function connect(cb) {
			console.log('connecting local database');
			var request = indexedDB.open('slatemail');
			request.onupgradeneeded = function () {
				console.log('upgrade needed');
				db = request.result;

				// Maps thread IDs to arrays that contain the message IDs of their emails.
				db.createObjectStore('threads', { keyPath: 'thread_id', autoIncrement: true });

				// Maps contact names to email addresses (unused right now).
				db.createObjectStore('contacts', { keyPath: 'address' });

				// Maps project IDs to arrays containing the thread IDs of the threads in the project.
				db.createObjectStore('projects', { keyPath: 'name' });

				// Maps PIDs to thread IDs. This is to ensure that a message that is moved to a different
				// box is organized into the same thread.
				db.createObjectStore('pids', { keyPath: 'pid' });

				// Stores email addresses that the user has blocked. Messages from these addresses are
				// downloaded but are never stored in a local box. An IMAP request is sent to delete them.
				db.createObjectStore('blocked', { keyPath: 'address' });

				// Caches user actons, like marking an email as complete
				db.createObjectStore('actions', { keyPath: 'action_id', autoIncrement: true });

				// Caches descriptors for each mailbox. Descriptors are a snapshot of the UIDs and flags
				// in each mailbox according to the LAST sync.
				db.createObjectStore('descriptors', { keyPath: 'mailbox' });
			};
			request.onsuccess = function () {
				console.log('success');
				db = request.result;
				db.onversionchange = function (event) {
					console.log('db version chagned');
				};
				db.onclose = function (event) {
					console.log('db closed');
				};
				db.onerorr = function (event) {
					console.log('db error');
					console.log(event);
				};
				cb(null, null);
			};
			request.onerror = function () {
				cb(request.error, null);
			};
			request.onblocked = function () {
				cb('blocked', null);
			};
		}
	}, {
		key: 'ensureProjectStore',
		value: function ensureProjectStore(cb) {
			// Is this necessary? Isn't the project ensured in the initial connect() method?
			if (db.objectStoreNames.contains('projects')) {
				cb();
			}
			var version = parseInt(db.version);
			db.close();
			var open_request = indexedDB.open('slatemail', version + 1);
			open_request.onupgradeneeded = function () {
				db = open_request.result;
				db.createObjectStore('projects', { keyPath: 'name' });
			};
			open_request.onsuccess = function () {
				cb();
			};
		}
	}, {
		key: 'ensureLocalBoxes',
		value: function ensureLocalBoxes(boxes, cb) {
			if (typeof boxes === 'string') {
				return this.ensureLocalBoxes([boxes]);
			}
			// If local store for $mailbox_name does not exist, create it.
			var boxes_to_make = (function () {
				var out = [];
				boxes.forEach(function (box) {
					if (db.objectStoreNames.contains('box_' + box) === false) {
						out.push(box);
					}
				});
				return out;
			})();
			console.log('boxes to make: ', boxes_to_make);
			if (boxes_to_make.length === 0) {
				if (cb) cb();
				return;
			}
			var version = parseInt(db.version, 10);
			db.close();
			var open_request = indexedDB.open('slatemail', version + 1);
			open_request.onupgradeneeded = function () {
				db = open_request.result;
				boxes_to_make.forEach(function (box) {
					var object_store = db.createObjectStore('box_' + box, {
						keyPath: 'uid'
					});
					object_store.createIndex('message_id', 'messageId', { unique: false });
					object_store.createIndex('short_subject', 'short_subject', { unique: false });
					object_store.createIndex('uid', 'uid', { unique: true });
					object_store.createIndex('date', 'date', { unique: false });
				});
			};
			open_request.onsuccess = function (e) {
				console.log('local mailboxes created: ', boxes_to_make);
				if (cb) cb();
			};
			open_request.onerror = function (event) {
				if (cb) cb(event.error);
			};
			open_request.onblocked = function (event) {
				if (cb) cb('blocked!');
			};
		}
	}, {
		key: 'saveMailToLocalBox',
		value: function saveMailToLocalBox(mailbox_name, mail_obj, cb) {
			var _this = this;

			// console.log('*** saving mail object to local box: '+mailbox_name+':'+mail_obj.uid+"\r");
			process.stdout.write('*** saving mail object to local box: ' + mailbox_name + ':' + mail_obj.uid + '\r');
			return this.saveAttachmentsAsync(mailbox_name, mail_obj).then(function (mail_obj) {
				mail_obj.mailbox = mailbox_name;
				var tx = db.transaction('box_' + mailbox_name, 'readwrite');
				var store = tx.objectStore('box_' + mailbox_name);
				mail_obj.uid = parseInt(mail_obj.uid, 10);
				mail_obj.subject = mail_obj.subject ? mail_obj.subject : '';
				mail_obj.short_subject = _this.shortenSubject(mail_obj.subject);
				mail_obj.pid = _this.getPID(mail_obj);
				var put_request = store.put(mail_obj);
				put_request.onsuccess = function () {
					// console.log('      save for '+mailbox_name+':'+mail_obj.uid+' successful!');
					// dbHandler.threadMail(mailbox_name, mail_obj);
					if (cb) cb();
				};
				put_request.onerror = function (err) {
					if (cb) cb(err);
				};
			})['catch'](function (err) {
				if (cb) cb(err);
			});
		}
	}, {
		key: 'getPID',
		value: function getPID(mail_obj) {
			return [mail_obj.subject.substring(0, 10) || '', mail_obj.headers.from || '', mail_obj.date, mail_obj.messageId].join('|');
		}
	}, {
		key: 'shortenSubject',
		value: function shortenSubject(subject) {
			if (subject) {
				return subject.replace(/([\[\(] *)?(RE?) *([-:;)\]][ :;\])-]*|$)|\]+ *$/igm, '');
			} else {
				return subject;
			}
			// return subject.replace(/([\[\(] *)?(RE|FWD?) *([-:;)\]][ :;\])-]*|$)|\]+ *$/igm, '');
		}
	}, {
		key: 'saveContact',
		value: function saveContact(mail_obj) {
			var sender = mail_obj.from[0];
			var sender_name = sender.name;
			var sender_address = sender.address;
			var data_to_store = {
				address: sender_address,
				name: sender_name
			};
			var tx = db.transaction('contacts', 'readonly');
			var store = tx.objectStore('contacts');
			var request = store.put(data_to_store);
			request.onsuccess = function () {};
		}
	}, {
		key: 'getLocalMailboxes',
		value: function getLocalMailboxes() {
			var stores = db.objectStoreNames;
			var out = [];
			var l = stores.length;
			for (var i = 0; i < l; i++) {
				var store = stores[i];
				if (store.indexOf('box_') > -1) {
					out.push(store.replace('box_', ''));
				}
			}
			return out;
		}
	}, {
		key: 'findFirstMailWithProperty',
		value: function findFirstMailWithProperty(property, values, current_index, cb) {
			var _this2 = this;

			// Searches all mailboxes for a message in which $property matches one of $values.
			// Stops when a message is found. Callback includes the FIRST message that is found.
			// console.log('find first mail with property '+property+' set to one of:');
			// console.log(values);
			if (typeof current_index === 'function') {
				callback = current_index;
				current_index = 0;
			}
			var value = values[current_index];
			return this.findMailWithPropertyAsync(property, value).then(function (mail_object) {
				if (mail_object === false || !mail_object.thread_id) {
					if (current_index < values.length - 1) {
						_this2.findFirstMailWithProperty(property, values, current_index + 1, callback);
					} else {
						cb(null, false);
					}
				} else {
					//console.log('message trace found thread_id: '+mail_object.thread_id);
					cb(null, mail_object);
				}
			})['catch'](function (err) {
				cb(err);
			});
		}
	}, {
		key: 'findMailWithProperty',
		value: function findMailWithProperty(property, value, cb) {
			// Searches all of the mailboxes for a message with a $property set to $value.
			// For example, property can be 'message_id'. Only works with properties that are
			// indexed.
			// console.log('searching for: '+property+', '+value);
			var boxes = this.getLocalMailboxes();
			var self = this;
			iteration(boxes, 0, function (mail_obj) {
				cb.resolve(null, mail_obj);
			});
			function iteration(boxes, index, cb) {
				self.getMailFromBoxWithPropertyAsync(boxes[index], property, value).then(function (mail_obj) {
					// console.log(mail_obj);
					if (!mail_obj) {
						if (index < boxes.length - 1) {
							iteration(boxes, index + 1, cb);
						} else {
							cb(false);
						}
					} else {
						cb(mail_obj);
					}
				})['catch'](function (err) {
					console.log(err);
				});
			}
		}
	}, {
		key: 'getMailFromBoxWithProperty',
		value: function getMailFromBoxWithProperty(mailbox_name, property, value, cb) {
			// console.log('getting mail from box '+mailbox_name + ' with property '+property+' set to '+value);
			var store_name = 'box_' + mailbox_name;
			if (!db.objectStoreNames.contains(store_name)) {
				cb(null, false);
			} else {
				var tx = db.transaction(store_name, 'readonly');
				var store = tx.objectStore(store_name);
				var index = store.index(property);
				var get_request = index.get(value);
				get_request.onsuccess = function () {
					var matching = get_request.result;
					if (matching !== undefined) {
						cb(null, get_request.result);
					} else {
						cb(null, false);
					}
				};
				get_request.onerror = function (err) {
					cb(err);
				};
			}
		}
	}, {
		key: 'getMailFromLocalBox',
		value: function getMailFromLocalBox(mailbox_name, uid, cb) {
			// console.log('getting mail from local box '+mailbox_name+':'+uid);
			console.time('getMailFromLocalBox ' + mailbox_name + ':' + uid);
			uid = parseInt(uid, 10);
			var tx = db.transaction('box_' + mailbox_name, 'readonly');
			var store = tx.objectStore('box_' + mailbox_name);
			var request = store.get(uid);
			request.onsuccess = function () {
				console.timeEnd('getMailFromLocalBox ' + mailbox_name + ':' + uid);
				if (cb) cb(null, request.result || false);
			};
			request.onerror = function (err) {
				console.log('error getting mail from local box ' + mailbox_name + ':' + uid);
				if (cb) cb(err, null);
			};
		}
	}, {
		key: 'updateFlags',
		value: function updateFlags(box_name, uid, flags, cb) {
			//console.log('updating flags on '+box_name+':'+uid);
			var tx = db.transaction('box_' + box_name, 'readwrite');
			var store = tx.objectStore('box_' + box_name);
			var get_request = store.get(uid);
			get_request.onsuccess = function () {
				if (!get_request.result) {
					return;
				}
				var data = get_request.result;
				if (!arraysEqual(data.flags, flags)) {
					data.flags = flags;
					var update_request = store.put(data);
					update_request.onsuccess = function () {
						//console.log('flag updated');
						if (cb) cb();
					};
				} else {
					if (cb) cb();
				}
			};
			function arraysEqual(arr1, arr2) {
				if (arr1.length !== arr2.length) return false;
				for (var i = arr1.length; i--;) {
					if (arr1[i] !== arr2[i]) return false;
				}
				return true;
			}
		}
	}, {
		key: 'removePID',

		// eraseMessage:function(box_name, uid){
		// 	// Removes every trace of the message everywhere.
		// 	var def = Q.defer();
		// 	var self = this;
		// 	Q.all([
		// 		self.removeLocalMessage(box_name, uid),
		// 		// dbHandler.removePid(), // TO-DO
		// 		self.imaper.markDeleted(box_name, uid)
		// 	])
		// 	.then(function(){
		// 		self.imaper.expunge(box_name);
		// 		def.resolve();
		// 	});
		// 	return def.promise;
		// ,
		value: function removePID(pid) {}
	}, {
		key: 'removeLocalMessage',
		value: function removeLocalMessage(box_name, uid, cb) {
			// Removes a message from the local store and removes it from its thread.
			// This does NOT delete the message on the IMAP server. It also does NOT
			// remove the message's PID.
			uid = parseInt(uid, 10);
			console.log('deleting local ' + box_name + ':' + uid);
			// var get_request = db.transaction("box_"+box_name,'readonly').objectStore("box_"+box_name).get(uid);
			this.getMailFromLocalBoxAsync(box_name, uid).then(function (mail_obj) {
				if (!mail_obj) {
					console.log('resolving because no mail object found');
					cb();
				} else {
					console.log('message retrieved, ', mail_obj);
					var thread = mail_obj.thread_id;
					var tx = db.transaction('box_' + box_name, 'readwrite');
					var object_store = tx.objectStore('box_' + box_name);
					var delete_request = object_store['delete'](uid);
					delete_request.onsuccess = function (event) {
						console.log('deleted: ' + box_name + ':' + uid);
						cb();
						// self.removeMessageFromThread(thread, box_name, uid)
						// 	.then(function(){
						// 		def.resolve();
						// 	});
					};
					delete_request.onerror = function (err) {
						cb(err);
					};
					tx.onsuccess = function () {
						cb();
					};
					tx.onerror = function (err) {
						console.log('transaction error: ', err);
						cb(err);
					};
				}
			})['catch'](function (err) {
				cb(err);
			});
		}
	}, {
		key: 'removeMessageFromThread',
		value: function removeMessageFromThread(thread_id, box_name, uid, cb) {
			console.log('removing message ' + box_name + ':' + uid + ' from ' + thread_id);
			var object_store = db.transaction('threads', 'readonly').objectStore('threads');
			var get_request = object_store.get(thread_id);
			get_request.onsuccess = function () {
				var thread_obj = get_request.result;
				var messages = thread_obj.messages;
				var mid = box_name + ':' + uid;
				var index = messages.indexOf(mid);
				if (index > -1) {
					messages.splice(index, 1);
					var put_request = db.transaction('threads', 'readwrite').objectStore('threads').put(thread_obj);
					put_request.onsuccess = function () {
						cb();
					};
				} else {
					cb();
				}
			};
			get_request.onerror = function (error) {
				console.log(error);
				cb(err);
			};
		}
	}, {
		key: 'getUIDsFromMailbox',
		value: function getUIDsFromMailbox(box_name, onKey, onEnd) {
			if (!db.objectStoreNames.contains('box_' + box_name)) {
				//console.log('local box does not exist');
				return;
			}
			var objectStore = db.transaction('box_' + box_name).objectStore('box_' + box_name);
			objectStore.index('uid').openKeyCursor().onsuccess = function (event) {
				var cursor = event.target.result;
				if (cursor) {
					if (onKey) {
						onKey(cursor.key);
					}
					cursor['continue']();
				} else {
					if (onEnd) {
						onEnd();
					}
				}
			};
		}
	}, {
		key: 'getMessagesFromMailbox',
		value: function getMessagesFromMailbox(box_name, onMessage, limit, offset, cb) {
			console.log('get messages from ' + box_name + ', limit is ' + limit + ', offset is ' + offset);
			if (!db.objectStoreNames.contains('box_' + box_name)) {
				console.log(box_name + ' does not exist');
				if (cb) cb();
			} else {
				var tx = db.transaction('box_' + box_name);
				var store = tx.objectStore('box_' + box_name);
				var index = store.index('date');
				var count = 0;
				index.openCursor(null, 'prev').onsuccess = function (event) {
					var cursor = event.target.result;
					if (cursor) {
						if (offset !== undefined && offset > 0 && count === 0) {
							cursor.advance(offset);
							offset = undefined;
						} else {
							var mail_object = cursor.value;
							if (onMessage) {
								onMessage(mail_object);
							}
							count++;
							if (limit === undefined || count < limit) {
								cursor['continue']();
							} else {
								console.log('resolving because limit is undefined or count is less than limit, offset is ' + offset + ' and limit is ' + limit);
								if (cb) cb();
							}
						}
					} else {
						console.log('resolving because no cursor anymore');
						if (cb) cb();
					}
				};
			}
		}
	}, {
		key: 'getThreads',
		value: function getThreads(thread_ids, cb) {
			var _this3 = this;

			console.log('GETTING THREADS IN DBHANDLER, thread_ids...');
			console.log(thread_ids);
			var promises = thread_ids.map(function (thread_id) {
				return _this3.getThreadAsync(thread_id);
			});
			Promise.all(promises).then(function (out) {
				cb(null, out);
			});
		}
	}, {
		key: 'getThread',
		value: function getThread(thread_id, cb) {
			console.log('dBHandler - getting thread ' + thread_id);
			thread_id = parseInt(thread_id, 10);
			var tx = db.transaction('threads', 'readonly');
			var objectStore = tx.objectStore('threads');
			var get_request = objectStore.get(thread_id);
			get_request.onsuccess = function (event) {
				var matching = get_request.result;
				// console.log('THREAD '+thread_id+' LOCATED, result is...');
				// console.log(matching);
				cb(null, matching);
			};
			get_request.onerror = function (err) {
				cb(err, null);
			};
		}
	}, {
		key: 'getThreadMessages',
		value: function getThreadMessages(thread_obj, cb) {
			var _this4 = this;

			// console.log('getting thread messages');
			var message_umis = thread_obj.messages;
			console.time('getThreadMessages');
			console.log('Total messages to get', message_umis.length);
			var promises = message_umis.map(function (umi, index) {
				umi = umi.split(':');
				var mailbox_name = umi[0];
				var uid = parseInt(umi[1], 10);
				return _this4.getMailFromLocalBoxAsync(mailbox_name, uid);
			});
			console.time('test1');
			Promise.all(promises).then(function (results) {
				promises.sort(sortByDate);
				console.timeEnd('test1');
				console.log(results);
				console.timeEnd('getThreadMessages');
				cb(null, results);
			})['catch'](cb);
			function sortByDate(a, b) {
				if (a.date > b.date) {
					return -1;
				} else {
					return 1;
				}
			}
		}
	}, {
		key: 'saveAttachments',
		value: function saveAttachments(box_name, mail_object, cb) {
			if (!mail_object.attachments) {
				if (cb) cb(null, mail_object);
				return def.promise;
			}
			var path = 'attachments/' + box_name + '/' + mail_object.uid + '/';
			fsx.ensureDir(path, function () {
				var attachments = mail_object.attachments;
				var attachments_to_save = attachments.length;
				var saved_attachments = 0;
				attachments.forEach(function (attachment, index) {
					fsx.writeFile(path + attachment.fileName, attachment.content, function () {
						delete mail_object.attachments[index].content;
						saved_attachments++;
						if (saved_attachments === attachments_to_save) {
							cb(null, mail_object);
						}
					});
				});
			});
		}
	}, {
		key: 'ensureProject',
		value: function ensureProject(project_name, cb) {
			//console.log('ensuring project: '+project_name);
			var tx = db.transaction('projects', 'readwrite');
			var store = tx.objectStore('projects');
			var blank_project = {
				threads: []
			};
			var get_request = store.get(project_name);
			get_request.onsuccess = function () {
				//console.log('success');
				var data = get_request.result;
				if (data === undefined) {
					var put_request = store.put({
						name: project_name,
						threads: []
					});
					put_request.onsuccess = function () {
						//console.log('project '+project_name+' created');
						if (cb) cb();
					};
					put_request.onerror = function () {};
				} else {
					if (cb) cb();
				}
			};
			get_request.onerror = function (err) {
				//console.log('error ensuring project: '+project);
				//console.log(event);
				cb(err, null);
			};
			// var request = store.put(blank_project);
			// request.onsuccess = function(){
			// 	def.resolve();
			// };
		}
	}, {
		key: 'putInProject',
		value: function putInProject(box_name, uid, project_name) {
			//console.log('putting '+box_name+':'+uid+' in project: '+project_name);
			this.ensureProjectStoreAsync().then(function () {
				return self.ensureProjectAsync(project_name);
			}).then(function () {
				return self.getMailFromLocalBoxAsync(box_name, uid);
			}).then(function (message_obj) {
				//console.log('adding thread id to project object');
				var tx = db.transaction('projects', 'readwrite');
				var store = tx.objectStore('projects');
				var get_request = store.get(project_name);
				get_request.onsuccess = function () {
					var project = get_request.result;
					if (project.threads.indexOf(message_obj.thread_id) === -1) {
						project.threads.push(message_obj.thread_id);
						var put_request = store.put(project);
						put_request.onsuccess = function () {
							cb(null, message_obj);
						};
						put_request.onerror = cb;
					} else {
						cb(null, message_obj);
					}
				};
				get_request.onerror = cb;
			}).then(function (message_obj, cb) {
				//console.log('updating thread object');
				//console.log(message_obj);
				var thread_id = message_obj.thread_id;
				var tx = db.transaction('threads', 'readwrite');
				var store = tx.objectStore('threads');
				var get_request = store.get(thread_id);
				get_request.onsuccess = function () {
					var thread_obj = get_request.result;
					if (thread_obj.project_id === project_name) {
						if (cb) cb();
					} else {
						thread_obj.project_id = project_name;
						var put_request = store.put(thread_obj);
						put_request.onsuccess = function () {
							if (cb) cb();
						};
						put_request.onerror = function (err) {
							cb(err);
							//console.log(err);
						};
					}
				};
				get_request.onerror = function (err) {
					cb(err);
				};
			}).fin(function () {
				cb();
			})['catch'](function (error) {
				cb(err);
			});
			return def.promise;
		}
	}, {
		key: 'getProject',
		value: function getProject(project_name, cb) {
			// Resolves with the project object of project name. The project object contains the message IDs.
			var tx = db.transaction('projects', 'readonly');
			var store = tx.objectStore('projects');
			var get_request = store.get(project_name);
			get_request.onsuccess = function () {
				var result = get_request.result;
				cb(null, result);
			};
			get_request.onerror = function (err) {
				console.log('could not retrieve project: ' + project_name);
				cb(err);
			};
		}
	}, {
		key: 'listProjects',
		value: function listProjects(cb) {
			// Resolves with a complete list of project names
			var tx = db.transaction('projects');
			var objectStore = tx.objectStore('projects');
			var arr = [];
			objectStore.openCursor(null, 'prev').onsuccess = function (event) {
				var cursor = event.target.result;
				if (cursor) {
					arr.push(cursor.value.name);
					cursor['continue']();
				} else {
					cb(null, arr);
				}
			};
		}
	}, {
		key: 'threadMessages',
		value: function threadMessages(message_ids, cb) {
			var _this5 = this;

			/*
   	For all messages in array $message_ids (e.g. "INBOX:100"):
   		1. Thread the message, updating the local message object with a thread_id.
   		2. Update the thread with the message id.
   		3. Store the thread ID with the message's PID.
   */
			console.log('threading messages');
			var promises = message_ids.map(function (message_id) {
				return _this5.threadMessageAsync(message_id);
			});
			return Promise.reduce(promises); // not sure if this is right
		}
	}, {
		key: 'threadMessage',
		value: function threadMessage(mailbox, uid) {
			console.log('---- threading message: ' + mailbox + ':' + uid + ' ----');
			var self = this;
			self.getMailFromLocalBox(mailbox, uid).then(function (mail_obj) {
				if (mail_obj.thread_id) {
					console.log(mailbox + ':' + uid + ' already has thread; skipping');
					return;
				}
				return findMatchingThread(mail_obj).then(function (thread_id) {
					return thread_id === false ? saveToNewThread(mailbox, uid) : saveToExistingThread(mailbox, uid, thread_id);
				}).then(function (results) {
					console.log('threading results', results);
					var promises = [storePID(mail_obj, results.thread_id)];
					if (results.muted === true && mailbox !== 'complete') {
						promises.push(self.moveToCompleteAsync(mailbox, uid));
					} else {
						promises.push(self.updateMailObjectAsync(mailbox, uid, results.thread_id));
					}
					return Promise.all(promises);
				})['catch'](function (err) {
					if (cb) cb(err);
				});
			}).fin(function () {
				console.log('*** threading of message ' + mailbox + ':' + uid + ' complete');
				if (cb) cb();
			})['catch'](function (err) {
				if (cb) cb(err);
			});

			function findMatchingThread(mail_obj, cb) {
				/* Takes an unthreaded $mail_obj and attempts to match it to
    an existing thread based on its properties. Resolves with a
    thread_id, or false if no thread is found.*/

				/* Determines the priority of each threading function. */
				var fncs = [getThreadByPID, traceInReplyTo, traceReferences, traceSubject];

				/* Step over $fncs until a result is found */
				step(0, function (thread_id) {
					cb(null, thread_id);
				});

				function step(i, cb) {
					var fnc = fncs[i];
					fnc(mail_obj).then(function (thread_id) {
						// console.log(thread_id);
						if (thread_id === false) {
							if (i === fncs.length - 1) {
								cb(false);
							} else {
								step(i + 1, cb);
							}
						} else {
							// console.log('returning with thread_id: '+thread_id);
							cb(thread_id);
						}
					});
				}

				/* THREADING FUNCTIONS */
				/* These all take a mail_obj and use its properties to try to match it to a thread. */

				function getThreadByPID(mail_obj) {
					/* Searches the PIDs for a message. The PID is a quasi-unique identifier based
     	on properties of the message. It's best to use this as the first threading
     	function to ensure that messages that have already been threaded in the past
     	that have since moved mailboxes are attached to the same threads as before.
     */
					var pid = mail_obj.pid;
					return new Promise(function (resolve, reject) {
						var tx = db.transaction('pids', 'readonly');
						var store = tx.objectStore('pids');
						var get_request = store.get(pid);
						get_request.onsuccess = function () {
							var result = get_request.result;
							if (!result) {
								resolve(false);
							} else {
								resolve(result.thread);
							}
						};
					});
				}
				function traceInReplyTo(mail_obj) {
					// console.log('by reply to');
					return traceByProperty(mail_obj, 'inReplyTo');
				}
				function traceReferences(mail_obj) {
					// console.log('by references');
					return traceByProperty(mail_obj, 'references');
				}
				function traceSubject(mail_obj) {
					// console.log('by subject');
					return new Promise(function (resolve, reject) {
						self.findFirstMailWithProperty('short_subject', [mail_obj.short_subject], function (mail_obj) {
							resolve(mail_obj.thread_id || false);
						});
					});
				}

				/* Helper functions */
				function traceByProperty(mail_obj, property) {
					return new Promise(function (resolve, reject) {
						if (mail_obj[property]) {
							traceMessage(mail_obj[property]).then(function (result) {
								resolve(result);
							});
						} else {
							resolve(false);
						}
					});
				}
				function traceMessage(message_ids) {
					// Searches all mailboxes for a message with a message_id inside $message_ids.
					// Stops when it finds one. Callbacks with the thread id of that message.
					// console.log('tracing message');
					return new Promise(function (resolve, reject) {
						self.findFirstMailWithProperty('message_id', message_ids, 0, function (mail_obj) {
							if (mail_obj === false) {
								resolve(false);
							} else {
								resolve(mail_obj.thread_id);
							}
						});
					});
				}
			}
			function saveToNewThread(mailbox, uid, cb) {
				/* Takes a mail_obj and stores its ID to a new thread, then callbacks with the new thread's ID */
				var tx = db.transaction('threads', 'readwrite');
				var store = tx.objectStore('threads');
				var data = {
					messages: [mailbox + ':' + uid]
				};
				var add_request = store.add(data);
				add_request.onsuccess = function (event) {
					var thread_id = event.target.result;
					console.log('           saved message ' + mailbox + uid + ' to new thread ' + thread_id);
					cb(null, { thread_id: event.target.result });
				};
			}
			function storePID(mail_object, thread_id, cb) {
				// console.log('storing pid '+mail_obj.pid+' to '+thread_id);
				// console.log('updating mail with thread id: '+box_name+':'+uid+' with '+thread_id);
				var tx = db.transaction('pids', 'readwrite');
				var store = tx.objectStore('pids');
				var put_request = store.put({
					pid: mail_object.pid,
					thread: thread_id
				});
				put_request.onsuccess = function () {
					// console.log('storing PID successful');
					if (cb) cb();
				};
				put_request.onerror = function (err) {
					console.log('error storing PID');
					if (cb) cb(err);
				};
			}

			function saveToExistingThread(mailbox_name, mail_uid, thread_id) {
				console.log('\t\tsaving ' + mailbox_name + ':' + mail_uid + ' to existing thread ' + thread_id);
				return new Promise(function (resolve, reject) {
					var tx = db.transaction('threads', 'readwrite');
					var store = tx.objectStore('threads');
					var get_request = store.get(thread_id);
					get_request.onsuccess = function () {
						var thread_obj = get_request.result;
						if (thread_obj.messages.indexOf(mailbox_name + ':' + mail_uid) > -1) {
							updateMailObject(mailbox_name, mail_uid, thread_id).then(function () {
								resolve({ thread_id: thread_id });
							});
						} else {
							thread_obj.messages.push(mailbox_name + ':' + mail_uid);
							var update_request = store.put(thread_obj);
							update_request.onsuccess = function () {
								resolve({ thread_id: thread_id, muted: thread_obj.muted });
							};
							update_request.onerror = function (err) {
								console.log('FAILED: saved message ' + mailbox_name + ':' + mail_uid + ' to existing thread ' + thread_id);
								console.log(err);
								reject(err);
							};
						}
					};
					get_request.onerror = function () {
						console.log('FAILED');
					};
				});
			}
			function updateMailObject(box_name, uid, thread_id, cb) {
				/* Adds $thread_id to a message's local mail object */
				console.log('updating mail object: ' + box_name + ':' + uid);
				self.getMailFromLocalBox(box_name, uid).then(function (mail_obj) {
					mail_obj.thread_id = thread_id;
					var tx = db.transaction('box_' + box_name, 'readwrite');
					var store = tx.objectStore('box_' + box_name);
					var update_request = store.put(mail_obj);
					update_request.onsuccess = function () {
						console.log('mail object updated');
						if (cb) cb();
					};
					update_request.onerror = function () {
						console.log('update request error');
						if (cb) cb();
					};
				})['catch'](function (err) {
					if (cb) cb(err);
				});
			}
		}
	}, {
		key: 'blockSender',
		value: function blockSender(sender_address, cb) {
			var tx = db.transaction('blocked', 'readwrite');
			var store = tx.objectStore('blocked');
			var update_request = store.put({ address: sender_address });
			update_request.onsuccess = function () {
				console.log(sender_address + ' added to blocked store');
				if (cb) cb();
			};
			update_request.onerror = function (err) {
				console.log('error adding ' + sender_address + ' to blocked store');
				if (cb) cb(err);
			};
			return def.promise;
		}
	}, {
		key: 'isSenderBlocked',
		value: function isSenderBlocked(sender_address, cb) {
			var tx = db.transaction('blocked', 'readonly');
			var store = tx.objectStore('blocked');
			var get_request = store.get(sender_address);
			get_request.onsuccess = function () {
				if (get_request.result) {
					if (cb) cb(null, true);
				} else {
					if (cb) cb(null, false);
				}
			};
			get_request.onerror = function (err) {
				if (cb) cb(err);
			};
			return def.promise;
		}
	}, {
		key: 'getScheduledBoxes',
		value: function getScheduledBoxes(cb) {
			this.getAllStoresAsync().then(function (stores) {
				var arr = [];
				for (var i = 0; i < stores.length; i++) {
					var store = stores[i];
					var prefix = 'box_SlateMail/scheduled/';
					if (store.length >= prefix.length) {
						if (store.substring(0, prefix.length) === 'box_SlateMail/scheduled/') {
							var store_date = new Date(store);
							var current_date = new Date();
							if (store_date < current_date) {
								arr.push(store);
							}
						}
					}
				}
				cb(null, arr);
			})['catch'](cb);
		}
	}, {
		key: 'getDueMail',
		value: function getDueMail(cb) {
			// TO-DO
			console.log('GET DUE MAIL');
			// Collects all mail that is past due from the scheduled local boxes.
			// Resolves with an array of mail objects sorted descended by date.
			var self = this;
			getAllScheduleBoxesAsync().then(function getMailObjects(stores) {
				return new Promise(function (resolve, reject) {
					var msgs = [];
					var promises = [];
					stores.forEach(function (store) {
						var mailbox_name = store.substring(4, store.length);
						promises.push(self.getMessagesFromMailbox(mailbox_name, function (mail_obj) {
							msgs.push(mail_obj);
						}));
					});
					Promise.all(promises).then(function () {
						resolve(msgs);
					});
				});
			}).then(function (msgs) {
				msgs.sort(function (a, b) {
					return a.date > b.date ? -1 : 1;
				});
				cb(null, msgs);
			});
		}
	}, {
		key: 'getAllStores',
		value: function getAllStores(cb) {
			// Gets the names of all the object stores in the slatemail database.
			// Resolves with a DOMStringList of the store names.
			indexedDB.open('slatemail').onsuccess = function (sender, args) {
				cb(null, sender.target.result.objectStoreNames);
			};
		}
	}, {
		key: 'getAllMailboxes',
		value: function getAllMailboxes(cb) {
			// Resolves with all local mailboxes (no box_ prefix) in an array.
			this.getAllStoresAsync().then(function (stores) {
				var out = [];
				for (var i = 0; i < stores.length; i++) {
					var store = stores[i];
					if (store.substring(0, 4) === 'box_') {
						out.push(store.substring(4, store.length));
					}
				}
				cb(null, out);
			});
		}
	}, {
		key: 'getMailboxTree',
		value: function getMailboxTree(cb) {
			// Gets all of the local mailboxes, and resolves with a tree-like structure describing the hierarchy
			// e.g. {INBOX:{},FolderA:{FolderB:{}}} etc.
			this.getAllMailboxesAsync().then(function (boxes) {
				var tree = arrToTree(boxes);
				cb(null, tree);
			})['catch'](function (err) {
				console.log(err);
			});

			function arrToTree(paths) {
				// Takes an array of paths and turns it into a tree.
				// ['a','a/b','a/c'] becomes {a:{b:{},c:{}}
				// So does ['a/b/c'];
				var tree = {};
				paths.forEach(function (path) {
					var segs = path.split('/');
					var last = tree;
					for (var i = 0; i < segs.length; i++) {
						if (!last[segs[i]]) {
							last[segs[i]] = {};
						}
						last = last[segs[i]];
					}
				});
				return tree;
			}
		}
	}, {
		key: 'deleteBoxes',
		value: function deleteBoxes(box_paths, cb) {
			console.log('delete boxes: ' + box_paths);
			var promises = box_paths.map(function (box_path) {
				return function () {
					deleteDescriptors(box_path);
				};
			});
			Promise.all(promises).then(function () {
				return deleteObjectStores(box_paths);
			}).then(function () {
				if (cb) cb();
			});
			return def.promise;
			function deleteDescriptors(box_name) {
				return new Promise(function (resolve, reject) {
					var store = db.transaction('descriptors', 'readwrite').objectStore('descriptors');
					var delete_request = store['delete'](box_name);
					delete_request.onsuccess = function () {
						resolve();
					};
					delete_request.onerror = function (err) {
						console.log(error);
						resolve();
					};
				});
			}
			function deleteObjectStores(box_paths) {
				return new Promise(function (resolve, reject) {
					var version = parseInt(db.version);
					db.close();
					var open_request = indexedDB.open('slatemail', version + 1);
					open_request.onupgradeneeded = function (event) {
						var db = event.target.result;
						box_paths.forEach(function (box_path) {
							if (db.objectStoreNames.contains('box_' + box_path)) {
								console.log('DELETE ' + box_path);
								db.deleteObjectStore('box_' + box_path);
							}
						});
						resolve();
					};
					open_request.onsuccess = function () {
						resolve();
					};
				});
			}
		}
	}, {
		key: 'updateMessage',
		value: function updateMessage(mail_obj, cb) {
			var store = db.transaction('box_' + mail_obj.mailbox, 'readwrite').objectStore('box_' + mail_obj.mailbox);
			var put_request = store.put(mail_obj);
			put_request.onsuccess = function () {
				if (cb) cb();
			};
			put_request.onerror = function (err) {
				if (cb) cb(err);
			};
		}
	}, {
		key: 'markSeen',
		value: function markSeen(mail_obj, cb) {
			// Marks a local email as "seen." Resolves if true if the operation was
			// successful, false if it wasn't or if the local mail already was seen.
			var self = this;
			if (mail_obj.flags.indexOf('\\Seen') === -1) {
				mail_obj.flags.push('\\Seen');
				self.updateMessageAsync(mail_obj).then(function () {
					cb(null, true);
				});
			} else {
				cb(null, false);
			}
			return def.promise;
		}
	}, {
		key: 'muteThread',
		value: function muteThread(thread_id, cb) {
			console.log('muting thread ' + thread_id);
			this.setThreadMuteStateAsync(thread_id, true).then(function () {
				cb();
			})['catch'](cb);
		}
	}, {
		key: 'unmuteThread',
		value: function unmuteThread(thread_id) {
			return this.setThreadMuteState(thread_id, false);
		}
	}, {
		key: 'setThreadMuteState',
		value: function setThreadMuteState(thread_id, state, cb) {
			console.log('set mute state: ' + thread_id);
			this.getThread(thread_id).then(function (thread_obj) {
				console.log('thread_obj', thread_obj);
				thread_obj.muted = state;
				var tx = db.transaction('threads', 'readwrite');
				var store = tx.objectStore('threads');
				var put_request = store.put(thread_obj);
				put_request.onsuccess = function () {
					console.log('success');
					if (cb) cb(null, true);
				};
				put_request.onerror = function (err) {
					console.log(err);
					if (cb) cb(null, false);
				};
			})['catch'](function (err) {
				if (cb) cb(err, null);
			});
		}
	}, {
		key: 'deleteProject',
		value: function deleteProject(project_name, cb) {
			console.log('deleting project: ' + project_name);
			var self = this;
			this.getProjectAsync(project_name).then(function (project_obj) {
				var thread_ids = project_obj.threads;
				var promises = thread_ids.map(function (thread_id) {
					return self.clearProjectFromThreadAsync(thread_id);
				});
				return Promise.all(promises);
			}).then(function () {
				return new Prmoise(function (resolve, reject) {
					var tx = db.transaction('projects', 'readwrite');
					var store = tx.objectStore('projects');
					var req = store['delete'](project_name);
					req.onsuccess = resolve;
					req.onerror = reject;
				});
			}).fin(function () {
				if (cb) cb();
			})['catch'](function (err) {
				if (cb) cb(err, null);
			});
		}
	}, {
		key: 'clearProjectFromThread',
		value: function clearProjectFromThread(thread_id, cb) {
			console.log('clearing project from thread: ' + thread_id);
			var self = this;
			this.getThreadAsync(thread_id).then(function (thread_obj) {
				if (!thread_obj) {
					if (cb) cb();
					return;
				}
				if (thread_obj.project_id) {
					delete thread_obj.project_id;
				}
				var tx = db.transaction('threads', 'readwrite');
				var store = tx.objectStore('threads');
				var put_request = store.put(thread_obj);
				put_request.onsuccess = function () {
					console.log('project removed from thread: ' + thread_id);
					if (cb) cb();
				};
				put_request.onerror = function (err) {
					console.log(err);
					if (cb) cb(err);
				};
			});
		}
	}]);

	return dbHandler;
})();

promisifyAll(dbHandler.prototype);

console.log('DBHANDLER!');

//console.log('contact stored: '+sender_address);
// TO-DO
// return def.promise;

//console.log('error ensuring project: '+project);
//console.log(event);