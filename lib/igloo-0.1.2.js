
function Igloo(gl, options) {
    var canvas;
    if (gl instanceof HTMLCanvasElement) {
        canvas = gl;
        gl = Igloo.getContext(gl, options);
    } else {
        canvas = gl.canvas;
    }
    this.gl = gl;
    this.canvas = canvas;
    this.defaultFramebuffer = new Igloo.Framebuffer(gl, null);
}


Igloo.QUAD2 = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);


Igloo.fetch = function(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, Boolean(callback));
    if (callback != null) {
        xhr.onload = function() {
            callback(xhr.responseText);
        };
    }
    xhr.send();
    return xhr.responseText;
};


Igloo.getContext = function(canvas, options, noerror) {
    var gl;
    try {
        gl = canvas.getContext('webgl', options || {}) ||
            canvas.getContext('experimental-webgl', options || {});
    } catch (e) {
        gl = null;
    }
    if (gl == null && !noerror) {
        throw new Error('Could not create WebGL context.');
    } else {
        return gl;
    }
};


Igloo.looksLikeURL = function(string) {
    return /^[\w+:\/\/]/.exec(string) != null;
};


Igloo.isArray = function(object) {
    var name = Object.prototype.toString.apply(object, []),
        re = / (Float(32|64)|Int(16|32|8)|Uint(16|32|8(Clamped)?))?Array]$/;
    return re.exec(name) != null;
};


 
Igloo.prototype.program = function(vertex, fragment, transform) {
    if (Igloo.looksLikeURL(vertex)) vertex = Igloo.fetch(vertex);
    if (Igloo.looksLikeURL(fragment)) fragment = Igloo.fetch(fragment);
    if (transform != null) {
        vertex = transform(vertex);
        fragment = transform(fragment);
    }
    return new Igloo.Program(this.gl, vertex, fragment);
};


Igloo.prototype.array = function(data, usage) {
    var gl = this.gl,
        buffer = new Igloo.Buffer(gl, gl.ARRAY_BUFFER);
    if (data != null) {
        buffer.update(data, usage == null ? gl.STATIC_DRAW : usage);
    }
    return buffer;
};


Igloo.prototype.elements = function(data, usage) {
    var gl = this.gl,
        buffer = new Igloo.Buffer(gl, gl.ELEMENT_ARRAY_BUFFER);
    if (data != null) {
        buffer.update(data, usage == null ? gl.STATIC_DRAW : usage);
    }
    return buffer;
};


Igloo.prototype.texture = function(source, format, wrap, filter) {
    var texture = new Igloo.Texture(this.gl, format, wrap, filter);
    if (source != null) {
        texture.set(source);
    }
    return texture;
};


Igloo.prototype.framebuffer = function(texture) {
    var framebuffer = new Igloo.Framebuffer(this.gl);
    if (texture != null) framebuffer.attach(texture);
    return framebuffer;
};


Igloo.Program = function(gl, vertex, fragment) {
    this.gl = gl;
    var p = this.program = gl.createProgram();
    gl.attachShader(p, this.makeShader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(p, this.makeShader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(p));
    }
    this.vars = {};
};


Igloo.Program.prototype.makeShader = function(type, source) {
    var gl = this.gl;
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        return shader;
    } else {
        throw new Error(gl.getShaderInfoLog(shader));
    }
};


Igloo.Program.prototype.use = function() {
    this.gl.useProgram(this.program);
    return this;
};


Igloo.Program.prototype.uniform = function(name, value, i) {
    if (value == null) {
        this.vars[name] = this.gl.getUniformLocation(this.program, name);
    } else {
        if (this.vars[name] == null) this.uniform(name);
        var v = this.vars[name];
        if (Igloo.isArray(value)) {
            var method = 'uniform' + value.length + (i ? 'i' : 'f') + 'v';
            this.gl[method](v, value);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            if (i) {
                this.gl.uniform1i(v, value);
            } else {
                this.gl.uniform1f(v, value);
            }
        } else {
            throw new Error('Invalid uniform value: ' + value);
        }
    }
    return this;
};


Igloo.Program.prototype.matrix = function(name, matrix, transpose) {
    if (this.vars[name] == null) this.uniform(name);
    var method = 'uniformMatrix' + Math.sqrt(matrix.length) + 'fv';
    this.gl[method](this.vars[name], Boolean(transpose), matrix);
    return this;
};


Igloo.Program.prototype.uniformi = function(name, value) {
    return this.uniform(name, value, true);
};


Igloo.Program.prototype.attrib = function(name, value, size, stride) {
    var gl = this.gl;
    if (value == null) {
        this.vars[name] = gl.getAttribLocation(this.program, name);
    } else {
        if (this.vars[name] == null) this.attrib(name); // get location
        value.bind();
        gl.enableVertexAttribArray(this.vars[name]);
        gl.vertexAttribPointer(this.vars[name], size, gl.FLOAT,
                               false, stride == null ? 0 : stride, 0);
    }
    return this;
};


Igloo.Program.prototype.draw = function(mode, count, type) {
    var gl = this.gl;
    if (type == null) {
        gl.drawArrays(mode, 0, count);
    } else {
        gl.drawElements(mode, count, type, 0);
    }
    if (gl.getError() !== gl.NO_ERROR) {
        throw new Error('WebGL rendering error');
    }
    return this;
};


Igloo.Program.prototype.disable = function() {
    for (var attrib in this.vars) {
        var location = this.vars[attrib];
        if (this.vars.hasOwnProperty(attrib)) {
            if (typeof location === 'number') {
                this.gl.disableVertexAttribArray(location);
            }
        }
    }
    return this;
};


Igloo.Buffer = function(gl, target) {
    this.gl = gl;
    this.buffer = gl.createBuffer();
    this.target = (target == null ? gl.ARRAY_BUFFER : target);
    this.size = -1;
};


Igloo.Buffer.prototype.bind = function() {
    this.gl.bindBuffer(this.target, this.buffer);
    return this;
};


Igloo.Buffer.prototype.update = function(data, usage) {
    var gl = this.gl;
    if (data instanceof Array) {
        data = new Float32Array(data);
    }
    usage = usage == null ? gl.DYNAMIC_DRAW : usage;
    this.bind();
    if (this.size !== data.byteLength) {
        gl.bufferData(this.target, data, usage);
        this.size = data.byteLength;
    } else {
        gl.bufferSubData(this.target, 0, data);
    }
    return this;
};


Igloo.Texture = function(gl, format, wrap, filter) {
    this.gl = gl;
    var texture = this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    wrap = wrap == null ? gl.CLAMP_TO_EDGE : wrap;
    filter = filter == null ? gl.LINEAR : filter;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    this.format = format = format == null ? gl.RGBA : format;
};

/**
 * @param {number} [unit] active texture unit to bind
 * @returns {Igloo.Texture}
 */
Igloo.Texture.prototype.bind = function(unit) {
    var gl = this.gl;
    if (unit != null) {
        gl.activeTexture(gl.TEXTURE0 + unit);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    return this;
};


Igloo.Texture.prototype.blank = function(width, height) {
    var gl = this.gl;
    this.bind();
    gl.texImage2D(gl.TEXTURE_2D, 0, this.format, width, height,
                  0, this.format, gl.UNSIGNED_BYTE, null);
    return this;
};



Igloo.Texture.prototype.set = function(source, width, height) {
    var gl = this.gl;
    this.bind();
    if (source instanceof Array) source = new Uint8Array(source);
    if (width != null || height != null) {
        gl.texImage2D(gl.TEXTURE_2D, 0, this.format,
                      width, height, 0, this.format,
                      gl.UNSIGNED_BYTE, source);
    } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, this.format,
                      this.format, gl.UNSIGNED_BYTE, source);
    }
    return this;
};


Igloo.Texture.prototype.subset = function(source, xoff, yoff, width, height) {
    var gl = this.gl;
    this.bind();
    if (source instanceof Array) source = new Uint8Array(source);
    if (width != null || height != null) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, xoff, yoff,
                         width, height,
                         this.format, gl.UNSIGNED_BYTE, source);
    } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, xoff, yoff,
                         this.format, gl.UNSIGNED_BYTE, source);
    }
    return this;
};


Igloo.Texture.prototype.copy = function(x, y, width, height) {
    var gl = this.gl;
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, this.format, x, y, width, height, 0);
    return this;
};


Igloo.Framebuffer = function(gl, framebuffer) {
    this.gl = gl;
    this.framebuffer =
        arguments.length == 2 ? framebuffer : gl.createFramebuffer();
    this.renderbuffer = null;
};


Igloo.Framebuffer.prototype.bind = function() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    return this;
};


Igloo.Framebuffer.prototype.unbind = function() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    return this;
};


Igloo.Framebuffer.prototype.attach = function(texture) {
    var gl = this.gl;
    this.bind();
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, texture.texture, 0);
    return this;
};


Igloo.Framebuffer.prototype.attachDepth = function(width, height) {
    var gl = this.gl;
    this.bind();
    if (this.renderbuffer == null) {
        this.renderbuffer = gl.createRenderbuffer();
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16,
                               width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
                                   gl.RENDERBUFFER, this.renderbuffer);
    }
    return this;
};
