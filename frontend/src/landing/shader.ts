// The hero background: flowing light leaks with film grain, drawn by one small fragment shader.
// No 3D library. It renders at a capped resolution, pauses when off-screen or when the tab is hidden,
// and draws a single still frame for people who prefer reduced motion.

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'

const FRAG = `
precision highp float;
uniform vec2 r; uniform float t; uniform float m;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), f.x), f.y);
}
void main(){
  vec2 uv = gl_FragCoord.xy / r;
  vec2 p = uv; p.x *= r.x / r.y;
  float w = n(p * 1.3 + vec2(t * .05, 0.)) * 1.2 + n(p * 3.1 - vec2(0., t * .07)) * .35;
  float d = p.x * .8 + p.y * 1.1 + w * .6 + m * .12;
  float band = sin(d * 5. - t * .25);
  float glow = smoothstep(.1, 1., band);
  float core = smoothstep(.8, 1., band);
  vec3 lime = vec3(.776, .957, .196), tape = vec3(1., .478, .239), bg = vec3(.047, .051, .063);
  vec3 c = mix(tape, lime, smoothstep(-.2, 1.2, uv.x + .3 * sin(d * 1.3 + t * .1)));
  float mask = smoothstep(.2, 1., uv.x * .95 + uv.y * .3 + w * .15);
  vec3 col = bg + c * (glow * .34 + core * .5) * mask;
  col += (h(gl_FragCoord.xy + fract(t) * 91.) - .5) * .06;
  gl_FragColor = vec4(col, 1.);
}`

export function startShader(canvas: HTMLCanvasElement): () => void {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
  if (!gl) return () => {} // the CSS gradient behind the canvas is the fallback

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return () => {}
  gl.useProgram(prog)

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const uR = gl.getUniformLocation(prog, 'r')
  const uT = gl.getUniformLocation(prog, 't')
  const uM = gl.getUniformLocation(prog, 'm')

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  let raf = 0
  let visible = true
  let dead = false
  let mouse = 0
  let mouseTarget = 0
  const t0 = performance.now()

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const hgt = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== hgt) {
      canvas.width = w
      canvas.height = hgt
      gl.viewport(0, 0, w, hgt)
    }
  }

  const draw = () => {
    mouse += (mouseTarget - mouse) * 0.04
    gl.uniform2f(uR, canvas.width, canvas.height)
    gl.uniform1f(uT, reduce ? 12 : (performance.now() - t0) / 1000 + 12)
    gl.uniform1f(uM, mouse)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const loop = () => {
    raf = 0
    if (dead || !visible || document.hidden) return
    draw()
    raf = requestAnimationFrame(loop)
  }
  const kick = () => {
    if (!raf && !reduce && !dead) raf = requestAnimationFrame(loop)
  }

  const ro = new ResizeObserver(() => {
    resize()
    draw()
  })
  ro.observe(canvas)
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    kick()
  })
  io.observe(canvas)
  const onMove = (e: PointerEvent) => {
    mouseTarget = e.clientX / window.innerWidth - 0.5
  }
  const onLost = (e: Event) => {
    e.preventDefault()
    dead = true
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('visibilitychange', kick)
  canvas.addEventListener('webglcontextlost', onLost)

  resize()
  draw()
  kick()

  return () => {
    dead = true
    cancelAnimationFrame(raf)
    ro.disconnect()
    io.disconnect()
    window.removeEventListener('pointermove', onMove)
    document.removeEventListener('visibilitychange', kick)
    canvas.removeEventListener('webglcontextlost', onLost)
  }
}
