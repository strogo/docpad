// Requirements
var
	mongoose = require('mongoose'),
	util = require(__dirname+'/util.js'),
	fs = require('fs'),
	yaml = require('yaml'),
	express = require('express'),
	gfm = require('github-flavored-markdown'),
	jade = require('jade'),
	eco = require('eco'),
	path = require('path'),
	async = require('async'),
	highlight = require("highlight").Highlight,
	Schema = mongoose.Schema,
	SchemaTypes = Schema.Types,
	ObjectId = Schema.ObjectId;

// Prepare
Array.prototype.hasCount = function(arr){
	var i,ii,n,nn,a,b,count=0;
	for ( i=0,n=this.length; i<n; ++i ) {
		a = this[i];
		for ( ii=0,nn=arr.length; ii<nn; ++ii ) {
			b = arr[b];
			if ( a === b ) {
				count++;
				break;
			}
		}
	}
	return count;
}

// DocPad
var DocPad = {
	/**
	 * Options
	 */
	options: {
		rootPath: null,
		outPath: 'out',
		srcPath: 'src',
		dsn: 'mongodb://localhost/docpad',
		markups: ['md','html'],
		templates: ['ejs']
	},

	/**
	 * Variables
	 */
	generating: false,

	/**
	 * Initialise Server
	 */
	init: function(){
		// Config
		this.options.rootPath = process.cwd();
		this.options.srcPath = this.options.rootPath+'/'+this.options.srcPath;
		this.options.outPath = this.options.rootPath+'/'+this.options.outPath;
		
		// Connect
		mongoose.connect(this.options.dsn);
		
		// Schemas
		this.LayoutSchema = new Schema({
			layout: String,
			fullPath: String,
			relativePath: String,
			relativeBase: String,
			body: String,
			content: String,
			date: Date,
			title: String
		}),
		this.DocumentSchema = new Schema({
			layout: String,
			fullPath: String,
			relativePath: String,
			relativeBase: String,
			url: String,
			tags: [String],
			relatedDocuments: [new Schema({
				url: String,
				title: String,
				date: Date
			})],
			body: String,
			content: String,
			contentRendered: String,
			date: Date,
			title: String
		});

		// Models
		mongoose.model('Layout',this.LayoutSchema);
		mongoose.model('Document',this.DocumentSchema);
		this.LayoutModel = mongoose.model('Layout'),
		this.DocumentModel = mongoose.model('Document'),

		// Generate
		this.generate();

		// Server
		var app = express.createServer();

		// Configuration
		app.configure(function(){
			// Standard
			app.use(express.methodOverride());
			app.use(express.errorHandler());

			// Routing
			app.use(app.router);
			app.use(express.static(DocPad.options.outPath));

			// Views
			//app.set('views', __dirname + '/views');
			//app.set('view engine', 'ejs');
			//app.use(express.bodyParser());

			// Nowpad
			//nowpad.setup(app);
		});

		// Route Document
		//app.get(/^(.*)/, DocPad.documentAction);

		// Listen
		app.listen(9778);
		console.log("Express server listening on port %d", app.address().port);
	},

	/**
	 * Clean the Database
	 */
	generateClean: function(next){
		async.parallel([
			function(callback){
				DocPad.LayoutModel.remove({},function(err){
					if ( err ) throw err;
					console.log('Cleaned Layouts');
					callback();
				});
			},
			function(callback){
				DocPad.DocumentModel.remove({},function(err){
					if ( err ) throw err;
					console.log('Cleaned Documents');
					callback();
				});
			}
		],
		function(){
			console.log('Cleaned Files');
			next();
		});
	},

	/**
	 * Parse the Files
	 */
	generateParse: function(next){
		// Prepare
		var
			layoutsSrcPath = this.options.srcPath+'/layouts',
			layoutsOutPath = this.options.outPath+'/layouts',
			docsSrcPath = this.options.srcPath+'/docs',
			docsOutPath = this.options.outPath+'/docs',
			publicSrcPath = this.options.srcPath+'/public',
			publicOutPath = this.options.outPath+'/public',
			parseFile = function(fileFullPath,fileRelativePath,fileStat,next){
				// Prepare
				var
					fileMeta = {},
					fileData = '',
					fileSplit = [],
					fileHead = '',
					fileBody = '';
				
				// Read the file
				fileData = fs.readFile(fileFullPath,function(err,data){
					// Fetch
					if ( err ) throw err;
					fileData = data.toString();
					
					// Extract Yaml Header
					fileSplit = fileData.split(/---+/);
					if ( fileSplit.length === 3 && !fileSplit[0] ) {
						// Extract Parts
						fileHead = fileSplit[1];
						fileBody = fileSplit[2];
						fileMeta = yaml.eval(fileHead);
					}
					else {
						// Extract Parts
						fileBody = fileData;
					}

					// Markup
					fileMeta.extension = path.extname(fileFullPath);
					switch ( fileMeta.extension ) {
						case '.jade':
							result = jade.render(fileBody);
							break;

						case '.md':
							fileMeta.content = gfm.parse(fileBody);
							break;
						
						case '.html':
						default:
							fileMeta.content = fileBody;
							break;
					}

					// Update Meta
					fileMeta.fullPath = fileFullPath;
					fileMeta.relativePath = fileRelativePath;
					fileMeta.relativeBase = (path.dirname(fileRelativePath)+'/'+path.basename(fileRelativePath,path.extname(fileRelativePath))).replace(/\/+/g,'/');
					fileMeta.url = fileMeta.relativeBase+'.html';
					fileMeta.body = fileBody;
					fileMeta.title = fileMeta.title || path.basename(fileFullPath);
					fileMeta.date = new Date(fileMeta.date || fileStat.ctime);

					// Setup Watch
					fs.watchFile(fileFullPath,function(curr,prev){
						if ( curr.mtime.getTime() !== prev.mtime.getTime() ) {
							// File was changed
							DocPad.generate();
						}
					});

					// Store FileMeta
					next(fileMeta);
				});
			},
			parseFiles = function(fullPath,callback,next){
				// Queue
				var completed = 0, total = 1, complete = function(){
					++completed;
					if ( completed === total ) {
						next();
					}
				};

				// Wrapper
				_parseFiles = function(fullPath,relativePath){
					// Read
					fs.readdir(fullPath,function(err, files){
						// Update
						total += files.length;
						complete();
						
						// Cycle
						files.forEach(function(file){
							// Prepare
							var
								fileFullPath = fullPath+'/'+file,
								fileRelativePath = relativePath+'/'+file,
								fileStat = fs.statSync(fileFullPath);

							// Handle
							if ( fileStat.isDirectory() ) {
								// Recurse
								_parseFiles(fileFullPath,fileRelativePath);
							}
							else {
								// Parse File
								parseFile(fileFullPath,fileRelativePath,fileStat,function(fileMeta){
									callback(fileMeta,function(){
										complete();
									});
								});
							}
						});
					});
				};

				// Start Parsing
				_parseFiles(fullPath,'',callback);
			};
		
		// Parse Files
		async.parallel([
			// Layouts
			function(callback){
				// Parse Layouts
				parseFiles(
					// Full Path
					layoutsSrcPath,
					// One Parsed
					function(fileMeta,next){
						// Prepare
						var Layout = new DocPad.LayoutModel(), key;

						// Apply
						for ( key in fileMeta ) {
							if ( fileMeta.hasOwnProperty(key) ) {
								Layout[key] = fileMeta[key];
							}
						}

						// Save
						Layout.save(function(err){
							if ( err ) throw err;
							console.log('Parsed Layout:',Layout.relativePath);
							next();
						});
					},
					// All Parsed
					function(){
						console.log('Parsed Layouts');
						callback();
					}
				);
			},
			// Documents
			function(callback){
				// Parse Documents
				parseFiles(
					// Full Path
					docsSrcPath,
					// One Parsed
					function(fileMeta,next){
						// Prepare
						var Document = new DocPad.DocumentModel(), key;

						// Apply
						for ( key in fileMeta ) {
							if ( fileMeta.hasOwnProperty(key) ) {
								Document[key] = fileMeta[key];
							}
						}

						// Save
						Document.save(function(err){
							if ( err ) throw err;
							console.log('Parsed Document:',Document.relativePath);
							next();
						});
					},
					// All Parsed
					function(){
						console.log('Parsed Documents');
						callback();
					}
				);
			}
		],
		function(err){
			if ( err ) throw err;
			console.log('Parsed Files');
			next();
		});
	},

	generateRelations: function(next){
		var
			completed = 0, total = 0, complete = function(){
				completed++;
				if ( completed === total ) {
					console.log('Generated Relations');
					next();
				}
			};

		// Find Documents
		DocPad.DocumentModel.find({}, function(err,Documents){
			if ( err ) throw err;
			// Render Documents
			Documents.forEach(function(Document){
				++total;
				
				// Prepare
				DocPad.DocumentModel.find({tags:{'$in':Document.tags}},function(err,relatedDocuments){
					var relatedDocumentsArray = [];
					if ( relatedDocuments.length !== 0 ) {
						relatedDocuments.sort(function(a, b) { 
							return a.tags.hasCount(Document.tags) < b.tags.hasCount(Document.tags);
						}).forEach(function(relatedDocument){
							relatedDocumentsArray.push({
								title: relatedDocument.title,
								url: relatedDocument.url,
								date: relatedDocument.date
							});
						});
					}
					Document.relatedDocuments = relatedDocumentsArray;
					Document.save(function(err){
						if ( err ) throw err;
						complete();
					});
				});
			});
		});
	},

	generateRender: function(next){
		// Prepare
		var
			_render = function(Document,templateData){
				var rendered = Document.content;
				rendered = highlight(rendered,false,true);
				rendered = eco.render(rendered,templateData);
				return rendered;
			},
			_renderRecursive = function(content,child,templateData,next){
				// Handle Parent
				if ( child.layout ) {
					// Find Parent
					DocPad.LayoutModel.findOne({relativeBase:'/'+child.layout},function(err,parent){
						// Prepare
						if ( err ) { throw err; }
						else if ( !parent ) { throw new Error('Could not find the layout ['+child.layout+']'); }

						// Render Parent
						templateData.content = content;
						content = _render(parent,templateData);

						// Recurse
						_renderRecursive(content,parent,templateData,next);
					});
				}
				else {
					// Loner
					next(content);
				}
			},
			render = function(Document,templateData,next){
				// Render Original
				var renderedContent = _render(Document,templateData);

				// Wrap in Parents
				_renderRecursive(renderedContent,Document,templateData,function(contentRendered){
					Document.contentRendered = contentRendered;
					Document.save(function(err){
						if ( err ) throw err;
						next();
					});
				});
			},
			completed = 0, total = 0, complete = function(){
				completed++;
				if ( completed === total ) {
					console.log('Rendered Files');
					next();
				}
			};


		// Find Documents
		DocPad.DocumentModel.find({}).sort('date',-1).execFind(function(err,Documents){
			if ( err ) throw err;
			// Render Documents
			Documents.forEach(function(Document){
				++total;
				render(
					Document,
					{
						Documents: Documents,
						DocumentModel: DocPad.DocumentModel,
						Document: Document
					},
					complete
				);
			});
		});
	},

	generateWriteFiles: function(next){
		// Prepare
		var
			completed = 0, total = 0, complete = function(){
				completed++;
				if ( completed === total ) {
					console.log('Wrote Files');
					next();
				}
			},
			_writeFiles = function(fullPath,relativePath){
				// Read
				fs.readdir(fullPath,function(err, files){
					// Update
					total += files.length;
					complete();
					
					// Cycle
					files.forEach(function(file){
						// Prepare
						var
							fileSrcPath = fullPath+'/'+file,
							fileRelativePath = relativePath+'/'+file,
							fileOutPath = DocPad.options.outPath+fileRelativePath,
							fileStat = fs.statSync(fileSrcPath);

						// Handle
						if ( fileStat.isDirectory() ) {
							// Recurse
							_writeFiles(fileSrcPath,fileRelativePath);
						}
						else {
							// Ensure Path
							util.ensurePath(path.dirname(fileOutPath),function(){
								// Copy File
								util.cp(fileSrcPath,fileOutPath,function(){
									complete();
								});
							});
						}
					});
				});
			};

		// Start Writing
		_writeFiles(DocPad.options.srcPath+'/public','');
	},

	generateWriteDocuments: function(next){
		// Prepare
		var
			completed = 0, total = 0, complete = function(){
				completed++;
				if ( completed === total ) {
					console.log('Rendered Documents');
					next();
				}
			};

		// Find Documents
		DocPad.DocumentModel.find({}, function (err, Documents) {
			if ( err ) throw err;
			// Render Documents
			Documents.forEach(function(Document){
				++total;

				// Prepare
				var fileFullPath = DocPad.options.outPath+Document.relativeBase+'.html';
				
				// Ensure Path
				util.ensurePath(path.dirname(fileFullPath),function(){
					// Write Document
					fs.writeFile(fileFullPath,Document.contentRendered,function(err){
						if ( err ) throw err;
						complete();
					});
				});
			});
		});
	},

	/**
	 * Write the Files and Documents
	 */
	generateWrite: function(next){
		async.parallel([
			function(callback){
				DocPad.generateWriteFiles(function(err){
					if ( err ) throw err;
					callback();
				});
			},
			function(callback){
				DocPad.generateWriteDocuments(function(err){
					if ( err ) throw err;
					callback();
				});
			}
		],
		function(){
			next();
		});
	},

	/**
	 * Generate the Static Website
	 * 1. Clean the Database
	 * 2. Parse the Source files
	 * 3. Render the Source Files
	 */
	generate: function(next){
		if ( DocPad.generating ) return;
		DocPad.generating = true;
		util.rmdir(DocPad.options.outPath,function(){
			DocPad.generateClean(function(){
				DocPad.generateParse(function(){
					DocPad.generateRelations(function(){
						DocPad.generateRender(function(){
							DocPad.generateWrite(function(){
								console.log('Website Generated');
								DocPad.generating = false;
								if ( next ) next();
							})
						})
					})
				})
			})
		});
	},

	/**
	 * Send back a user homepage
	 */
	documentAction: function(req, res){
		// Prepare
		var
			user = req.params[0],
			file = req.params[1];
			requestPath = Hyde.options.rootPath+'/users/'+user+'/documents/'+file;

		// Check if the request path already exists
		if ( path.existsSync(requestPath) )	{
			return res.send(fs.readFileSync(requestPath).toString());
		}

		// Get supported extension
		var filePath = Hyde.getSupportedFile(requestPath);

		// Check if the supported file exists
		if ( !filePath ) {
			console.log('missing: ['+filePath+'] ['+requestPath+']');
			return Hyde.missingAction(req,res);
		}

		// Return the rendered supported file
		var fileResult = Hyde.renderSupportedFile(filePath);

		// Wrap it in the template
		res.send(fileResult);
		//var path = './_users/'+res.params.id+'/'+res.params[1];
	},

	/**
	 * Send back a 404 page
	 */
	missingAction: function(req,res) {
		res.send(req.params);
	},

	/**
	 * Get Support File
	 */
	getSupportedFile: function(filePath){
		// Prepare
		var result = false;

		// Handle
		Hyde.options.format.each(function(key,value){
			var fullPath = filePath+'.'+value;
			if ( path.existsSync(fullPath) ) {
				result = fullPath;
				return false;
			}
		});

		// Return
		return result;
	}
};

DocPad.init();