/* Simplex noise 3D (Ashima Arts / Stefan Gustavson, MIT). */
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

export const VERT = /* glsl */ `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aBary;
uniform mat4 uProj;
uniform mat3 uRot;
uniform float uTime;
uniform float uScale;
uniform float uDist;
uniform vec2 uMouse;
out vec3 vNormal;
out vec3 vPos;
out vec3 vBary;
${NOISE}
vec3 deform(vec3 n){
  float d = snoise(n*1.15 + vec3(0.0,0.0,uTime*0.2))*0.11
          + snoise(n*2.3 - vec3(uTime*0.12))*0.025;
  /* puxa a superfície na direção do cursor (espaço de visão) */
  vec3 m = normalize(vec3(uMouse*0.9, 0.75));
  float pull = pow(max(dot(n, m), 0.0), 4.0) * 0.16 * clamp(length(uMouse)*1.4, 0.0, 1.0);
  return n*(1.0 + d + pull);
}
void main(){
  vec3 n = normalize(uRot*aPos);
  vec3 P = deform(n);
  vec3 t = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0)));
  vec3 b = cross(n, t);
  float e = 0.012;
  vec3 P1 = deform(normalize(n + t*e));
  vec3 P2 = deform(normalize(n + b*e));
  vNormal = normalize(cross(P1 - P, P2 - P));
  vec3 pv = P*uScale;
  pv.z -= uDist;
  vPos = pv;
  vBary = aBary;
  gl_Position = uProj*vec4(pv, 1.0);
}`;

export const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vPos;
in vec3 vBary;
uniform vec3 uLens;   /* x, y em px do framebuffer (origem embaixo), raio em px */
uniform float uDpr;
out vec4 outColor;

/* "estúdio" falso: céu claro + chão quente + duas softboxes */
vec3 env(vec3 d){
  float y = d.y*0.5 + 0.5;
  vec3 c = mix(vec3(0.55,0.24,0.03), vec3(1.0,0.93,0.80), smoothstep(0.25, 0.85, y));
  c += smoothstep(0.88, 1.0, dot(d, normalize(vec3(-0.55, 0.65, 0.5)))) * 1.6;
  c += smoothstep(0.93, 1.0, dot(d, normalize(vec3(0.8, -0.1, 0.55)))) * 0.7;
  return c;
}

void main(){
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vPos);
  float ndv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - ndv, 2.5);

  /* âmbar líquido: núcleo luminoso, bordas mais densas (absorção) */
  vec3 core = vec3(1.0, 0.70, 0.18);
  vec3 deep = vec3(0.86, 0.36, 0.02);
  vec3 T = refract(-V, N, 0.70);
  vec3 R = reflect(-V, N);
  /* faixas de "líquido" vindas da refração */
  float caustic = smoothstep(0.35, 1.0, env(T).r) * 0.5 + 0.5;
  vec3 col = mix(core, deep, smoothstep(0.0, 0.85, 1.0 - ndv)) * (0.75 + caustic*0.45);
  /* reflexo do ambiente e aro claro */
  col = mix(col, env(R), fres*0.55);
  col += pow(fres, 3.0) * vec3(1.0, 0.92, 0.75) * 0.35;
  /* especular nítido (vidro) */
  col += pow(max(dot(R, normalize(vec3(-0.45, 0.6, 0.65))), 0.0), 90.0) * 1.1;
  col += pow(max(dot(R, normalize(vec3(0.6, -0.2, 0.75))), 0.0), 40.0) * 0.25;
  col = col / (1.0 + col*0.18);

  float d = distance(gl_FragCoord.xy, uLens.xy);
  float inLens = 1.0 - smoothstep(uLens.z - 1.5*uDpr, uLens.z, d);

  if (inLens <= 0.0) { outColor = vec4(col, 1.0); return; }

  /* camada de baixo: wireframe (baricêntricas) + matriz de pontos tipo ASCII */
  vec3 w = fwidth(vBary);
  vec3 eb = smoothstep(vec3(0.0), w*1.3, vBary);
  float edge = 1.0 - min(min(eb.x, eb.y), eb.z);
  vec2 cell = mod(gl_FragCoord.xy, 5.0*uDpr) - 2.5*uDpr;
  float dots = 1.0 - smoothstep(0.55*uDpr, 1.1*uDpr, length(cell));
  float shade = 0.25 + fres*0.75;
  float a = max(edge*0.95, dots*shade*0.55);
  vec3 wc = mix(vec3(0.96, 0.66, 0.16), vec3(0.91, 0.90, 0.88), edge*0.35);
  vec4 wire = vec4(wc*a, a);            /* pré-multiplicado */
  outColor = mix(vec4(col, 1.0), wire, inLens);
}`;
