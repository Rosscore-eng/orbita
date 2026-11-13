// Agujero negro de fondo: trazado de rayos con curvatura de Schwarzschild (rs = 1) y disco de acreción.
const FRAG = `
precision highp float;
uniform vec2 R; uniform float T;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*R)/min(R.x,R.y);
  uv.y+=.17;
  float k=.23; uv=mat2(cos(k),-sin(k),sin(k),cos(k))*uv;
  vec3 ro=vec3(0.,1.5+.5*sin(T*.07),-16.);
  vec3 fw=normalize(-ro), rt=normalize(cross(vec3(0,1,0),fw)), up=cross(fw,rt);
  vec3 p=ro, v=normalize(fw*1.05+rt*uv.x+up*uv.y);
  vec3 h=cross(p,v); float h2=dot(h,h);
  vec3 acc=vec3(0.); float tr=1.; bool fell=false;
  float a=T*.05; mat2 rot=mat2(cos(a),-sin(a),sin(a),cos(a));
  for(int i=0;i<150;i++){
    float r2=dot(p,p);
    if(r2<1.){fell=true;break;}
    if(r2>420.&&dot(p,v)>0.)break;
    float dt=max(.05*sqrt(r2),.03);
    v+=-1.5*h2*p/(r2*r2*sqrt(r2))*dt;
    vec3 np=p+v*dt;
    if(p.y*np.y<0.){
      vec3 c=mix(p,np,p.y/(p.y-np.y));
      float r=length(c.xz), rr=(r-2.6)/7.;
      if(rr>0.&&rr<1.){
        vec2 q=rot*c.xz;
        float ring=noise(vec2(r*7.+noise(q*.8)*2.5,1.7));
        float fall=smoothstep(0.,.07,rr)*pow(1.-rr,2.2);
        float dop=1.-.5*c.x/r; dop*=dop;
        float heat=fall*dop*(.3+1.1*ring*ring)*(.55+.45*noise(q*1.3));
        acc+=tr*mix(vec3(1.,.55,.14),vec3(1.,.95,.84),clamp(heat*1.5,0.,1.))*heat*3.2;
        tr*=1.-.75*clamp(fall*2.,0.,1.);
      }
    }
    p=np;
  }
  if(!fell){
    vec3 d=normalize(v);
    float s=hash(floor(vec2(atan(d.x,d.z)*90.,d.y*140.)));
    acc+=tr*vec3(1.,.92,.8)*smoothstep(.9975,1.,s)*.5;
    acc+=vec3(1.,.82,.55)*exp(-abs(sqrt(h2)-2.6)*12.)*.8; // anillo de fotones suave en el parámetro de impacto crítico (el real es más fino que un píxel)
  }
  vec3 col=1.-exp(-acc*1.5);
  col*=1.-.35*dot(uv,uv);
  gl_FragColor=vec4(col,1.);
}`;

export function blackHole(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { antialias: false, powerPreference: 'low-power' });
  if (!gl) return; // sin WebGL queda el degradado estático del CSS
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  };
  const pr = gl.createProgram()!;
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(pr, 'R'), uT = gl.getUniformLocation(pr, 'T');

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = -1e9;
  const frame = (ms: number) => {
    if (!still) requestAnimationFrame(frame);
    if (ms - last < 33) return; // 30 fps bastan y cuidan los PCs modestos
    last = ms;
    const w = Math.ceil(canvas.clientWidth / 2), h = Math.ceil(canvas.clientHeight / 2); // media resolución
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    gl.uniform2f(uR, w, h); gl.uniform1f(uT, ms / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  requestAnimationFrame(frame);
  if (still) addEventListener('resize', () => requestAnimationFrame(frame));
}
