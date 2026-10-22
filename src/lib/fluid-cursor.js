/*!
 * fluid-cursor.js — WebGL fluid "paint splat" cursor. Vanilla JS, no deps.
 * Simulation and shaders follow Pavel Dobryakov's WebGL-Fluid-Simulation (MIT).
 *
 * Usage (module): import { initFluidCursor } from './lib/fluid-cursor.js'; initFluidCursor(canvas)
 * Tuning: CONFIG below — DENSITY_DISSIPATION = trail length, CURL = swirl, SPLAT_RADIUS = blob size.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- config
  var CONFIG = {
    SIM_RESOLUTION: 48,
    DYE_RESOLUTION: 384,        // 512 is used when linear filtering is unsupported
    DENSITY_DISSIPATION: 5.5,   // higher = ink fades faster (shorter trail)
    VELOCITY_DISSIPATION: 3.8,  // higher = motion dies sooner
    PRESSURE: 0.12,
    PRESSURE_ITERATIONS: 6,
    CURL: 1.2,                  // swirl strength (vorticity confinement)
    SPLAT_RADIUS: 0.035,        // blob size (divided by 100 internally, as in Dobryakov)
    SPLAT_FORCE: 1700,          // how hard mouse motion pushes the fluid
    BURST_CHANCE: 0.015,        // share of frames with a sudden burst
    BURST_MULT: 2.2             // burst multiplier for the mouse delta
  };

  var CSS = '#fluid{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;opacity:.6;z-index:400}' +
    '@media (max-width:799px),(hover:none) and (pointer:coarse){#fluid{display:none}}';

  var inst = null;

  // ---------------------------------------------------------------- shaders
  var HI = 'precision highp float; precision highp sampler2D;\n';
  var MD = 'precision mediump float; precision mediump sampler2D;\n';
  var V = 'varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;\n';

  var baseVertex = HI + V + `attribute vec2 aPosition; uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0); vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y); vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

  var clearShader = MD + V + `uniform sampler2D uTexture; uniform float value;
void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`;

  // No shading, no background: rgb is the ink, alpha = its brightness (premultiplied).
  var displayShader = HI + V + `uniform sampler2D uTexture;
void main () { vec3 c = texture2D(uTexture, vUv).rgb; gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`;

  var splatShader = HI + V + `uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
void main () {
  vec2 p = vUv - point.xy; p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);
}`;

  // Semi-Lagrangian advection; manual bilinear sampling when linear filtering is unavailable.
  var advectionShader = HI + V + `uniform sampler2D uVelocity; uniform sampler2D uSource;
uniform vec2 texelSize; uniform vec2 dyeTexelSize; uniform float dt; uniform float dissipation;
vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5; vec2 iuv = floor(st); vec2 fuv = fract(st);
  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize); vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize); vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}
void main () {
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec4 result = bilerp(uSource, coord, dyeTexelSize);
#else
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  vec4 result = texture2D(uSource, coord);
#endif
  gl_FragColor = result / (1.0 + dissipation * dt);
}`;

  var divergenceShader = MD + V + `uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x; float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y; float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; } if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; } if (vB.y < 0.0) { B = -C.y; }
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

  var curlShader = MD + V + `uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).y; float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x; float B = texture2D(uVelocity, vB).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

  var vorticityShader = HI + V + `uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
void main () {
  float L = texture2D(uCurl, vL).x; float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x; float B = texture2D(uCurl, vB).x; float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001; force *= curl * C; force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy + force * dt;
  gl_FragColor = vec4(min(max(velocity, -1000.0), 1000.0), 0.0, 1.0);
}`;

  var pressureShader = MD + V + `uniform sampler2D uPressure; uniform sampler2D uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;
  gl_FragColor = vec4((L + R + B + T - texture2D(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`;

  var gradientSubtractShader = MD + V + `uniform sampler2D uPressure; uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;
  gl_FragColor = vec4(texture2D(uVelocity, vUv).xy - vec2(R - L, T - B), 0.0, 1.0);
}`;

  // ---------------------------------------------------------------- WebGL setup
  function supportsRenderTexture(gl, internal, format, type) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, type, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    return ok;
  }

  // Try R16F → RG16F → RGBA16F (WebGL2); WebGL1 only has RGBA.
  function getFormat(gl, internal, format, type) {
    if (supportsRenderTexture(gl, internal, format, type)) return { internal: internal, format: format };
    if (gl.R16F && internal === gl.R16F) return getFormat(gl, gl.RG16F, gl.RG, type);
    if (gl.RG16F && internal === gl.RG16F) return getFormat(gl, gl.RGBA16F, gl.RGBA, type);
    return null;
  }

  function getContext(canvas) {
    var params = { alpha: true, premultipliedAlpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    var gl = canvas.getContext('webgl2', params);
    var isWebGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
    if (!gl) return null;

    var type, linear;
    if (isWebGL2) {
      gl.getExtension('EXT_color_buffer_float');
      type = gl.HALF_FLOAT;
      linear = true; // half-float textures are filterable in WebGL2 core
    } else {
      var hf = gl.getExtension('OES_texture_half_float');
      linear = !!gl.getExtension('OES_texture_half_float_linear');
      type = hf && hf.HALF_FLOAT_OES;
    }
    if (!type) return null;

    var rgba = isWebGL2 ? getFormat(gl, gl.RGBA16F, gl.RGBA, type) : getFormat(gl, gl.RGBA, gl.RGBA, type);
    var rg = isWebGL2 ? getFormat(gl, gl.RG16F, gl.RG, type) : rgba;
    var r = isWebGL2 ? getFormat(gl, gl.R16F, gl.RED, type) : rgba;
    if (!rgba || !rg || !r) return null;
    return { gl: gl, type: type, linear: linear, rgba: rgba, rg: rg, r: r };
  }

  function compile(gl, kind, src, defines) {
    if (defines) src = defines.map(function (d) { return '#define ' + d + '\n'; }).join('') + src;
    var s = gl.createShader(kind);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function makeProgram(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPosition');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p: p, u: u, bind: function () { gl.useProgram(p); } };
  }

  // ---------------------------------------------------------------- main
  function create(canvas, ownsCanvas) {
    var ctx = getContext(canvas);
    if (!ctx) return null;
    var gl = ctx.gl;
    var dyeRes = ctx.linear ? CONFIG.DYE_RESOLUTION : 512;
    var filter = ctx.linear ? gl.LINEAR : gl.NEAREST;

    var vs = compile(gl, gl.VERTEX_SHADER, baseVertex);
    var frag = function (src, defs) { return compile(gl, gl.FRAGMENT_SHADER, src, defs); };
    var P = {
      clear: makeProgram(gl, vs, frag(clearShader)),
      display: makeProgram(gl, vs, frag(displayShader)),
      splat: makeProgram(gl, vs, frag(splatShader)),
      advection: makeProgram(gl, vs, frag(advectionShader, ctx.linear ? null : ['MANUAL_FILTERING'])),
      divergence: makeProgram(gl, vs, frag(divergenceShader)),
      curl: makeProgram(gl, vs, frag(curlShader)),
      vorticity: makeProgram(gl, vs, frag(vorticityShader)),
      pressure: makeProgram(gl, vs, frag(pressureShader)),
      gradient: makeProgram(gl, vs, frag(gradientSubtractShader))
    };

    // Full-screen quad, attribute 0
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    function blit(target) {
      if (target) { gl.viewport(0, 0, target.w, target.h); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); }
      else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    function fbo(w, h, f, flt) {
      gl.activeTexture(gl.TEXTURE0);
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, flt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, flt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, w, h, 0, f.format, ctx.type, null);
      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return {
        tex: tex, fbo: fb, w: w, h: h, tx: 1 / w, ty: 1 / h,
        attach: function (id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; },
        free: function () { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); }
      };
    }

    // Ping-pong pair: read from one, render into the other, swap.
    function pingPong(w, h, f, flt) {
      var a = fbo(w, h, f, flt), b = fbo(w, h, f, flt);
      return {
        w: w, h: h, tx: a.tx, ty: a.ty,
        get read() { return a; }, get write() { return b; },
        swap: function () { var t = a; a = b; b = t; },
        free: function () { a.free(); b.free(); }
      };
    }

    function resolution(res) {
      var aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
      if (aspect < 1) aspect = 1 / aspect;
      var min = Math.round(res), max = Math.round(res * aspect);
      return gl.drawingBufferWidth > gl.drawingBufferHeight ? { w: max, h: min } : { w: min, h: max };
    }

    var dye, velocity, divergence, curl, pressure;
    function initFramebuffers() {
      [dye, velocity, divergence, curl, pressure].forEach(function (x) { if (x) x.free(); });
      var sim = resolution(CONFIG.SIM_RESOLUTION), d = resolution(dyeRes);
      gl.disable(gl.BLEND);
      dye = pingPong(d.w, d.h, ctx.rgba, filter);
      velocity = pingPong(sim.w, sim.h, ctx.rg, filter);
      divergence = fbo(sim.w, sim.h, ctx.r, gl.NEAREST);
      curl = fbo(sim.w, sim.h, ctx.r, gl.NEAREST);
      pressure = pingPong(sim.w, sim.h, ctx.r, gl.NEAREST);
    }

    // Canvas size follows its CSS size × devicePixelRatio; returns false while hidden.
    function resize() {
      var dpr = window.devicePixelRatio || 1;
      var w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
      if (!w || !h) return false;
      if (canvas.width !== w || canvas.height !== h || !dye) { canvas.width = w; canvas.height = h; initFramebuffers(); }
      return true;
    }

    function inkColor() {
      return { r: 0.8 + Math.random() * 0.2, g: Math.random() * 0.01, b: Math.random() * 0.02 };
    }

    function splat(x, y, dx, dy, color) {
      var aspect = canvas.width / canvas.height;
      var radius = CONFIG.SPLAT_RADIUS / 100;
      if (aspect > 1) radius *= aspect;
      P.splat.bind();
      gl.uniform1i(P.splat.u.uTarget, velocity.read.attach(0));
      gl.uniform1f(P.splat.u.aspectRatio, aspect);
      gl.uniform2f(P.splat.u.point, x, y);
      gl.uniform3f(P.splat.u.color, dx, dy, 0);
      gl.uniform1f(P.splat.u.radius, radius);
      blit(velocity.write); velocity.swap();
      gl.uniform1i(P.splat.u.uTarget, dye.read.attach(0));
      gl.uniform3f(P.splat.u.color, color.r, color.g, color.b);
      blit(dye.write); dye.swap();
    }

    // One simulation step: curl → vorticity → divergence → pressure → gradient → advect.
    function step(dt) {
      gl.disable(gl.BLEND);
      P.curl.bind();
      gl.uniform2f(P.curl.u.texelSize, velocity.tx, velocity.ty);
      gl.uniform1i(P.curl.u.uVelocity, velocity.read.attach(0));
      blit(curl);

      P.vorticity.bind();
      gl.uniform2f(P.vorticity.u.texelSize, velocity.tx, velocity.ty);
      gl.uniform1i(P.vorticity.u.uVelocity, velocity.read.attach(0));
      gl.uniform1i(P.vorticity.u.uCurl, curl.attach(1));
      gl.uniform1f(P.vorticity.u.curl, CONFIG.CURL);
      gl.uniform1f(P.vorticity.u.dt, dt);
      blit(velocity.write); velocity.swap();

      P.divergence.bind();
      gl.uniform2f(P.divergence.u.texelSize, velocity.tx, velocity.ty);
      gl.uniform1i(P.divergence.u.uVelocity, velocity.read.attach(0));
      blit(divergence);

      P.clear.bind();
      gl.uniform1i(P.clear.u.uTexture, pressure.read.attach(0));
      gl.uniform1f(P.clear.u.value, CONFIG.PRESSURE);
      blit(pressure.write); pressure.swap();

      P.pressure.bind();
      gl.uniform2f(P.pressure.u.texelSize, velocity.tx, velocity.ty);
      gl.uniform1i(P.pressure.u.uDivergence, divergence.attach(0));
      for (var i = 0; i < CONFIG.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(P.pressure.u.uPressure, pressure.read.attach(1));
        blit(pressure.write); pressure.swap();
      }

      P.gradient.bind();
      gl.uniform2f(P.gradient.u.texelSize, velocity.tx, velocity.ty);
      gl.uniform1i(P.gradient.u.uPressure, pressure.read.attach(0));
      gl.uniform1i(P.gradient.u.uVelocity, velocity.read.attach(1));
      blit(velocity.write); velocity.swap();

      var A = P.advection;
      A.bind();
      gl.uniform2f(A.u.texelSize, velocity.tx, velocity.ty);
      if (!ctx.linear) gl.uniform2f(A.u.dyeTexelSize, velocity.tx, velocity.ty);
      var v = velocity.read.attach(0);
      gl.uniform1i(A.u.uVelocity, v);
      gl.uniform1i(A.u.uSource, v);
      gl.uniform1f(A.u.dt, dt);
      gl.uniform1f(A.u.dissipation, CONFIG.VELOCITY_DISSIPATION);
      blit(velocity.write); velocity.swap();

      if (!ctx.linear) gl.uniform2f(A.u.dyeTexelSize, dye.tx, dye.ty);
      gl.uniform1i(A.u.uVelocity, velocity.read.attach(0));
      gl.uniform1i(A.u.uSource, dye.read.attach(1));
      gl.uniform1f(A.u.dissipation, CONFIG.DENSITY_DISSIPATION);
      blit(dye.write); dye.swap();
    }

    function render() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.BLEND);
      P.display.bind();
      gl.uniform1i(P.display.u.uTexture, dye.read.attach(0));
      blit(null);
    }

    // ---------------------------------------------------------------- input
    var pointer = { x: 0, y: 0, dx: 0, dy: 0, moved: false, ready: false };

    function toUV(e) {
      var dpr = window.devicePixelRatio || 1;
      return { x: (e.clientX * dpr) / canvas.width, y: 1 - (e.clientY * dpr) / canvas.height };
    }

    function onMove(e) {
      if (!canvas.width) return;
      var p = toUV(e);
      if (!pointer.ready) { pointer.x = p.x; pointer.y = p.y; pointer.ready = true; return; }
      var aspect = canvas.width / canvas.height;
      var dx = p.x - pointer.x, dy = p.y - pointer.y;
      if (aspect < 1) dx *= aspect; else dy /= aspect; // keep motion isotropic
      pointer.dx += dx; pointer.dy += dy;              // accumulate until next frame
      pointer.x = p.x; pointer.y = p.y;
      pointer.moved = true;
      wake();
    }

    function onDown(e) {
      if (!canvas.width || !dye) return;
      var p = toUV(e);
      var c = inkColor();
      c.r *= 10; c.g *= 10; c.b *= 10;
      splat(p.x, p.y, 10 * (Math.random() - 0.5), 30 * (Math.random() - 0.5), c);
      wake();
    }

    // ---------------------------------------------------------------- loop
    // The loop sleeps once the ink has faded (no input for IDLE_MS) and wakes on the next mouse event,
    // so an idle page costs no GPU. With DENSITY_DISSIPATION 5.5 the ink is at e^-14 after 2.5 s.
    var IDLE_MS = 2500;
    var raf = 0, last = performance.now(), lastInput = -Infinity;

    function wake() {
      lastInput = performance.now();
      if (!raf && !document.hidden) { last = lastInput; raf = requestAnimationFrame(frame); }
    }

    function frame() {
      var now = performance.now();
      if (now - lastInput > IDLE_MS) { raf = 0; return; }
      raf = requestAnimationFrame(frame);
      var dt = Math.min((now - last) / 1000, 1 / 60);
      last = now;
      if (!resize()) return; // hidden (narrow screen) — skip work
      if (pointer.moved) {
        var k = Math.random() < CONFIG.BURST_CHANCE ? CONFIG.BURST_MULT : 1; // sudden bursts
        splat(pointer.x, pointer.y, pointer.dx * k * CONFIG.SPLAT_FORCE, pointer.dy * k * CONFIG.SPLAT_FORCE, inkColor());
        pointer.dx = pointer.dy = 0;
        pointer.moved = false;
      }
      step(dt);
      render();
    }

    function onVisibility() {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf && performance.now() - lastInput < IDLE_MS) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mousedown', onDown, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    resize(); // real canvas size before the first mousemove, the loop itself starts only on input

    return {
      destroy: function () {
        cancelAnimationFrame(raf);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mousedown', onDown);
        document.removeEventListener('visibilitychange', onVisibility);
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        if (ownsCanvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  // ---------------------------------------------------------------- public API
  function isTouchOnly() {
    return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }

  function init(canvas) {
    if (inst) return window.FluidCursor;
    if (isTouchOnly()) return window.FluidCursor;
    if (!document.getElementById('fluid-cursor-style')) {
      var st = document.createElement('style');
      st.id = 'fluid-cursor-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var owns = false;
    canvas = canvas || document.getElementById('fluid');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'fluid';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
      owns = true;
    }
    try { inst = create(canvas, owns); } catch (err) { console.warn('[fluid-cursor]', err); inst = null; }
    if (!inst && owns && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    return window.FluidCursor;
  }

  window.FluidCursor = {
    config: CONFIG,
    init: init,
    destroy: function () {
      if (inst) { inst.destroy(); inst = null; }
      var st = document.getElementById('fluid-cursor-style');
      if (st) st.parentNode.removeChild(st);
    }
  };

})();

// ES module entry used by the site (src/main.js); the IIFE above also exposes window.FluidCursor.
export const initFluidCursor = (canvas) => window.FluidCursor.init(canvas);
export const destroyFluidCursor = () => window.FluidCursor.destroy();
