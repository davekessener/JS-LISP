(function ($) {
	function onException(e) {
		console.log('' + e);
		throw e;
	}

	function writeToStdout(s) {
		$('#lisp-stdout').val($('#lisp-stdout').val() + s);
	}

	const TOK_CTL = 'control';
	const TOK_SYM = 'symbol';
	const TOK_NUM = 'number';
	const TOK_STR = 'string';
	const TOK_BIN = 'buildin';
	const TOK_FUN = 'lambda';
	const TOK_MAC = 'macro';
	const TOK_CNS = 'cell';
	const TOK_LOG = 'bool'
	const TOK_NIL = 'nil';

	function Token(type, value) {
		this.type = type;
		this.value = value;

		this.toString = function ( ) {
			var v = this.value;

			if(this.type === TOK_STR) {
				v = '"' + v + '"';
			}

			return "[" + this.type + ": " + v + "]";
		}
	}

	const nil = new Token(TOK_NIL, 'nil');

// # ==========================================================================

	function Tokenizer(code) {
		this.buffer = code;
		this.ridx = 0;

		this.done = function ( ) {
			return this.ridx >= this.buffer.length;
		};

		function isID(c) {
			return (c >= 'a' && c <= 'z')
				|| c === '*'
				|| c === '-'
				|| c === '_'
				|| c === '.'
				|| c === '?'
				|| c === '!';
		}

		function isOP(c) {
			return c === '+'
				|| c === '-'
				|| c === '*'
				|| c === '/'
				|| c === '='
				|| c === '<'
				|| c === '>'
				|| c === '&'
				|| c === '|'
				|| c === '!'
				|| c === '.'
				|| c === "'";
		}

		this.getChar = function (o) {
			o = (o || 0);

			if(this.ridx + o >= this.buffer.length) {
				onException("trying to read beyond buffer length!");
			}

			return this.buffer[this.ridx + o].toLowerCase();
		};
		
		this.readNext = function ( ) {
			var c = this.getChar();

			if(c === '[') c = '(';
			if(c === ']') c = ')';

			if(c === '(' || c === ')' || c === '.' || c === "'") {
				++this.ridx;
				return new Token(TOK_CTL, c);
			} else if((c >= 'a' && c <= 'z') || c === '*' || c === '_' || c === '#' || c === '&' || c === '$') {
				var t = c;

				++this.ridx;

				while(!this.done() && isID(c = this.getChar())) {
					t += c;
					++this.ridx;
				}

				return new Token(TOK_SYM, t);
			} else if (c === '-' || (c >= '0' && c <= '9')) {
				if(c === '-' && (this.done() || !(this.getChar(1) >= '0' && this.getChar(1) <= '9'))) {
					++this.ridx;
					return new Token(TOK_SYM, '-');
				}

				var t = c;

				++this.ridx;

				function readNum(o) {
					while(!o.done() && ((c = o.getChar()) >= '0' && c <= '9')) {
						t += c;
						++o.ridx;
					}
				}

				readNum(this);

				if(c === '.') {
					t += c;
					++this.ridx;

					readNum(this);
				}

				return new Token(TOK_NUM, +(t));
			} else if(c === '"') {
				var t = '';

				++this.ridx;
				c = '';

				while(!this.done() && (c = this.buffer[this.ridx]) !== '"') {
					++this.ridx;

					if(c === '\\') {
						if(this.done()) {
							onException('prematurely terminated escape sequence!');
						}

						c = this.buffer[this.ridx];
						++this.ridx;

						if(c === '"') {
							t += '"';
						} else if(c === 'n') {
							t += '\n';
						} else if(c === 't') {
							t += '\t';
						} else {
							onException('unknown escape sequence \\' + c + ' @' + this.ridx);
						}
					} else {
						t += c;
					}
				}

				if(c !== '"') {
					onException('prematurely terminated string @' + this.ridx);
				}

				++this.ridx;

				return new Token(TOK_STR, t);
			} else if(isOP(c)) {
				var t = '';
				while(isOP(c = this.getChar())) {
					t += c;
					++this.ridx;
				}
				return new Token(TOK_SYM, t);
			} else {
				onException("unknown char '" + c + "' @" + this.ridx);
			}
		};

		this.skipWS = function ( ) {
			for(var c ; !this.done() && ((c = this.getChar()) === ' ' || c === '\t' || c === '\n') ; ++this.ridx) { }
		};

		this.pop = function ( ) {
			this.look = this.readNext();

			this.skipWS();

			return this.look;
		}

		this.skipWS();

		return this;
	}

// # ==========================================================================

	function Cell(car, cdr) {
		this.car = car;
		this.cdr = cdr;

		this.toString = function (nfirst) {
			var t = '';

			if(nfirst) {
			} else {
				t += '(';
			}

			t += this.car.value.toString();

			if(this.cdr.type === TOK_NIL) {
				t += ')';
			} else if(this.cdr.type === TOK_CNS) {
				t += ' ';
				t += this.cdr.value.toString(true);
			} else {
				var v = this.cdr.value.toString();

				if(this.cdr.type === TOK_STR) {
					v = '"' + v + '"';
				}

				t += ' . ' + v + ')';
			}

			return t;
		}
	}

	function createAST(tok) {
		if(tok.done()) {
			return nil;
		}

		var t = tok.pop();
		var c;

		if(t.type === TOK_CTL) {
			if(t.value === '(') {
				var car = createAST(tok);
				var cdr = createAST(tok);

				c = new Cell(car, cdr);
			} else if(t.value === ')') {
				return nil;
			} else if(t.value === "'") {
				var tmp = createAST(tok);

				var car = tmp.value.car;
				var cdr = tmp.value.cdr;

				car = new Token(TOK_CNS, new Cell(car, nil));

				var q = new Token(TOK_SYM, 'quote');

				q = new Token(TOK_CNS, new Cell(q, car));

				c = new Cell(q, cdr);
			} else if(t.value === '.') {
				var cdr = createAST(tok);

				if(cdr.value.cdr.type !== 'nil') {
					onException("unexpected " + cdr.value.cdr);
				}

				return cdr.value.car;
			}
		} else {
			c = new Cell(t, createAST(tok));
		}

		return new Token(TOK_CNS, c);
	}

// # ==========================================================================

	function eval_part(c, e) {
		if(c.type === TOK_CNS) {
			return new Token(TOK_CNS,
				new Cell(eval(c.value.car, e)[0],
					eval_part(c.value.cdr, e)));
		} else if(c.type === TOK_NIL) {
			return c;
		} else {
			return eval(c, e)[0];
		}
	}

	function eval(c, e) {
		if(c.type === TOK_SYM) {
			console.log("eval sym: " + c);
			return [e.find(c.value), e];
		} else if(c.type === TOK_CNS) {
			console.log("eval expr: " + c);
			var t = eval(c.value.car, e);

			if((typeof t[0].value.apply) !== 'function') {
				onException("trying to call " + t[0]);
			}

			return t[0].value.apply(c.value.cdr, e);
		} else {
			console.log("eval const: " + c);
			return [c, e];
		}
	}

	function eval_super(ast) {
		return eval(ast, createDefaultEnv())[0];
	}

// # ==========================================================================

	function Binding(k, v, env) {
		this.key = k;
		this.value = v;
		this.env = env;

		this.find = function (k) {
			if(this.key === k) {
				return this.value;
			} else {
				if(this.env === undefined) {
					onException('unknown symbol ' + k);
				}

				return this.env.find(k);
			}
		}
	}

	function Executable(args, body) {
		this.args = args;
		this.body = body;

		this.apply = function (a, env) {
			var b = this.args;
			var e = env;

			while(b.type !== TOK_NIL) {
				var key = b.value.car;
				var val = undefined;
				
				if(a !== undefined) {
					val = a.value.car;
				}

				b = b.value.cdr;

				if(key.type === TOK_CNS) {
					if(val === undefined) {
						val = key.value.cdr.value.car;
					}
					key = key.value.car.value;
				} else if(key.value[0] === '&') {
					key = key.value.slice(1);
					val = (a || nil);

					if(b.type !== TOK_NIL) {
						onException('unexpected ' + b);
					}
				} else {
					key = key.value;
				}

				if(val === undefined) {
					onException('missing arguments @' + b + '!');
				}

				e = new Binding(key, val, e);

				if(a !== undefined) {
					a = a.value.cdr;
				}
			}

			return [eval(this.body, e)[0], env];
		}
	}

	function Lambda(args, body) {
		this.exec = new Executable(args, body);

		this.apply = function (a, e) {
			return this.exec.apply(eval_part(a, e), e);
		}

		this.toString = function ( ) {
			return "[lambda-f " + this.exec.args + "]";
		};
	}

	function Macro(args, body) {
		this.exec = new Executable(args, body);

		this.apply = function (a, e) {
			var t = this.exec.apply(a, e);

			console.log('macro expansion: ' + t[0]);

			return eval(t[0], e);
		};

		this.toString = function ( ) {
			return "[macro " + this.exec.args + "]";
		};
	}

	function Script(name, f) {
		this.name = name;

		this.apply = ((c, e) => {
			c = eval_part(c, e);

			return f(c, e);
		});

		this.toString = function ( ) {
			return "[buildin-" + this.name + "]";
		};
	}

	function Buildin(name, f) {
		this.name = name;

		this.apply = f;

		this.toString = function ( ) {
			return "[buildin-x-" + this.name + "]";
		};
	}

	function buildin_begin( ) {
		return new Token(TOK_BIN, new Buildin('begin', (c, e) => {
			var res;
			var env = e;

			while(c.type !== TOK_NIL) {
				var t = eval(c.value.car, env);

				res = t[0];
				env = t[1];

				c = c.value.cdr;

				if(c === undefined) {
					onException('malformed list!');
				}
			}

			return [res, e];
		}));
	}

	function buildin_quote( ) {
		return new Token(TOK_BIN, new Buildin('quote', (c, e) => {
			return [c.value.car, e];
		}));
	}

	function buildin_arith(name, f) {
		return new Token(TOK_BIN, new Script(name, (c, e) => {
			var t = undefined;

			while(c.type !== TOK_NIL) {
				var r = c.value.car.value;

				if(t !== undefined) {
					t = f(t, r);
				} else {
					t = r;
				}

				c = c.value.cdr;
			}

			if(t === Infinity || t === -Infinity || t === NaN || t === -NaN) {
				return [new Token(TOK_LOG, false), e];
			} else {
				return [new Token(TOK_NUM, t), e];
			}
		}));
	}

	function buildin_logic(name, f) {
		return new Token(TOK_BIN, new Buildin(name, (c, e) => {
			var t = undefined;

			while(c.type !== TOK_NIL) {
				var r = eval(c.value.car, e)[0].value;

				if(t !== undefined && !f(t, r)) {
					return [new Token(TOK_LOG, false), e];
				} else {
					t = r;
				}

				c = c.value.cdr;
			}

			return [new Token(TOK_LOG, true), e];
		}));
	}

	function buildin_lambda( ) {
		return new Token(TOK_BIN, new Buildin('lambda', (c, e) => {
			var args = c.value.car;
			var body = c.value.cdr.value.car;

			console.log("Creating lambda with args " + args);

			return [new Token(TOK_FUN, new Lambda(args, body)), e];
		}));
	}

	function buildin_macro( ) {
		return new Token(TOK_BIN, new Buildin('macro', (c, e) => {
			var args = c.value.car;
			var body = c.value.cdr.value.car;

			console.log("Creating macro with args " + args);

			return [new Token(TOK_MAC, new Macro(args, body)), e];
		}));
	}

	function buildin_define( ) {
		return new Token(TOK_BIN, new Buildin('define', (c, e) => {
			var sym = c.value.car.value;
			var val = eval(c.value.cdr.value.car, e)[0];

			e = new Binding(sym, val, e);

			return [nil, e];
		}));
	}

	function buildin_if( ) {
		return new Token(TOK_BIN, new Buildin('if', (c, e) => {
			var cond = c.value.car;
			var then_b = c.value.cdr.value.car;
			var else_b = c.value.cdr.value.cdr.value.car;

			cond = eval(cond, e)[0];

			if(cond.type === TOK_NIL || (cond.type === TOK_LOG && cond.value === false)) {
				if(c.value.cdr.value.cdr.type === TOK_NIL) {
					return [nil, e];
				} else {
					return [eval(else_b, e)[0], e];
				}
			} else {
				return [eval(then_b, e)[0], e];
			}
		}));
	}

	function buildin_car( ) {
		return new Token(TOK_BIN, new Script('car', (c, e) => {
			return [c.value.car.value.car, e];
		}));
	}

	function buildin_cdr( ) {
		return new Token(TOK_BIN, new Script('cdr', (c, e) => {
			return [c.value.car.value.cdr, e];
		}));
	}

	function buildin_cons( ) {
		return new Token(TOK_BIN, new Script('cons', (c, e) => {
			return [new Token(TOK_CNS, new Cell(c.value.car, c.value.cdr.value.car)), e];
		}));
	}

	function buildin_list( ) {
		return new Token(TOK_BIN, new Script('list', (c, e) => {
			return [c, e];
		}));
	}

	function buildin_typeof( ) {
		return new Token(TOK_BIN, new Script('typeof', (c, e) => {
			return [new Token(TOK_STR, c.value.car.type), e];
		}));
	}

	function buildin_eval( ) {
		return new Token(TOK_BIN, new Script('eval', (c, e) => {
			var expr = c.value.car;

			if(expr.type === TOK_STR) {
				expr = createAST(new Tokenizer(expr.value));
				expr = new Token(TOK_CNS, new Cell(new Token(TOK_SYM, 'begin'), expr));
			}

			return [eval(expr, e)[0], e];
		}));
	}

	function buildin_int( ) {
		return new Token(TOK_BIN, new Script('int', (c, e) => {
			return [new Token(TOK_NUM, Math.floor(c.value.car.value)), e];
		}));
	}

	function buildin_random( ) {
		return new Token(TOK_BIN, new Script('random', (c, e) => {
			return [new Token(TOK_NUM, Math.random()), e];
		}));
	}

	function buildin_format( ) {
		return new Token(TOK_BIN, new Script('format', (c, e) => {
			var t = '';
			var f = c.value.car.value;

			if(c.value.car.type !== TOK_STR) {
				onException('format expects string as first argument, not ' + c.value.car);
			}

			c = c.value.cdr;

			for(var i = 0 ; i < f.length ; ++i) {
				if(f[i] === '%') {
					if(i + 1 < f.length && f[i + 1] === '%') {
						t += '%';
						++i;
					} else {
						t += c.value.car.value;
						c = c.value.cdr;
					}
				} else {
					t += f[i];
				}
			}

			return [new Token(TOK_STR, t), e];
		}));
	}

	function buildin_print( ) {
		return new Token(TOK_BIN, new Script('print', (c, e) => {
			var v = c.value.car;

			writeToStdout(v.value.toString());

			return [v, e];
		}));
	}

	function buildin_str_getc( ) {
		return new Token(TOK_BIN, new Script('str-getc', (c, e) => {
			var s = c.value.car.value.toString();
			var n = c.value.cdr.value.car.value;

			return [new Token(TOK_NUM, +(s[n])), e];
		}));
	}

	function buildin_str_len( ) {
		return new Token(TOK_BIN, new Script('str-len', (c, e) => {
			var s = c.value.car.value.toString();

			return [new Token(TOK_NUM, s.length), e];
		}));
	}

	function createDefaultEnv( ) {
		var e = undefined;

		function add(k, v) {
			e = new Binding(k, v, e);
		}

		function boolEval(v) {
			return !(v === 'nil' || !(v));
		}

		add('begin', buildin_begin());
		add('quote', buildin_quote());
		add('lambda', buildin_lambda());
		add('macro', buildin_macro());
		add('define', buildin_define());
		add('eval', buildin_eval());
		add('if', buildin_if());
		add('car', buildin_car());
		add('cdr', buildin_cdr());
		add('cons', buildin_cons());
		add('list', buildin_list());
		add('int', buildin_int());
		add('random', buildin_random());
		add('typeof', buildin_typeof());
		add('format', buildin_format());
		add('print', buildin_print());
		add('str-getc', buildin_str_getc());
		add('str-len', buildin_str_len());
		add('+', buildin_arith('add', (a, b) => a + b));
		add('-', buildin_arith('sub', (a, b) => a - b));
		add('*', buildin_arith('mul', (a, b) => a * b));
		add('/', buildin_arith('div', (a, b) => a / b));
		add('==', buildin_logic('eq', (a, b) => a === b));
		add('!=', buildin_logic('ne', (a, b) => a !== b));
		add('<', buildin_logic('lt', (a, b) => a < b));
		add('<=', buildin_logic('le', (a, b) => a <= b));
		add('>', buildin_logic('gt', (a, b) => a > b));
		add('>=', buildin_logic('ge', (a, b) => a >= b));
		add('&&', buildin_logic('and', (a, b) => boolEval(a) && boolEval(b)));
		add('||', buildin_logic('or', (a, b) => boolEval(a) || boolEval(b)));
		add('!', new Token(TOK_BIN, new Script('not', (c, e) => {
			return [new Token(TOK_LOG, (c.value.car.value === false || c.value.car.type === TOK_NIL)), e];
		})));
		add('#t', new Token(TOK_LOG, true));
		add('#f', new Token(TOK_LOG, false));
		add('nil', nil);

		return e;
	}

// # ==========================================================================
	
	function run( ) {
		var code = $('#lisp-code').val().trim();
		var input = $('#lisp-stdin').val();

		$('#lisp-stdout').val('');

		if(code !== '') try {
			var tok = new Tokenizer(code);
			var ast = createAST(tok);

			ast = new Token(TOK_CNS, new Cell(new Token(TOK_SYM, 'begin'), ast));
			
			var result = eval_super(ast);
			var s = result.value.toString();

			if(result.type === TOK_STR) {
				s = '"' + s + '"';
			}

			writeToStdout(s);

			console.log('[DONE]');
		} catch(e) {
			writeToStdout('ERROR: ' + e);
		}
	}

	$(function ( ) {
		var storage = (localStorage || sessionStorage);
		var code = storage.lisp_code;
		var stdin = storage.lisp_stdin;
		
		if(code !== undefined) {
			$('#lisp-code').val(code);
		}

		if(stdin !== undefined) {
			$('#lisp-stdin').val(stdin);
		}

		$('#lisp-run').click(function ( ) {
			storage.lisp_code = $('#lisp-code').val();
			storage.lisp_stdin = $('#lisp-stdin').val();

			run();
		});
	});
})(jQuery);

