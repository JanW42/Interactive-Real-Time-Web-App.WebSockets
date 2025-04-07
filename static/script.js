const socket = io();
const container = document.getElementById("messages");

socket.on("connect", () => {
    console.log("Verbunden mit Server");
});

socket.on("new_message", (data) => {
    const msg = document.createElement("div");
    msg.classList.add("message");
    msg.textContent = data.text;

    container.appendChild(msg);

    const all = container.querySelectorAll(".message");

    // Wenn mehr als 5 Nachrichten, die älteste entfernen
    if (all.length >= 6) {
        container.removeChild(all[0]);
    }
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 10;
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("ai-canvas"),
  alpha: true,
  antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);

// Licht
const light = new THREE.PointLight(0xffa500, 2, 20);
light.position.set(0, 0, 5);
scene.add(light);

// Innerer Kern
const innerSphereGeometry = new THREE.SphereGeometry(1.2, 64, 64);
const innerSphereMaterial = new THREE.MeshPhongMaterial({
  color: 0xffa500,
  transparent: true,
  opacity: 0.6,
  shininess: 180,
  emissive: 0xffa500,
  emissiveIntensity: 0.6,
  depthWrite: false
});
const innerSphere = new THREE.Mesh(innerSphereGeometry, innerSphereMaterial);
scene.add(innerSphere);

// Äußere Kugel
const sphereGeometry = new THREE.SphereGeometry(2, 64, 64); // Weniger Segmente
const sphereMaterial = new THREE.MeshPhongMaterial({
  color: 0xffa500,
  transparent: true,
  opacity: 0.4,
  shininess: 120,
  depthWrite: false
});
const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(sphere);

// Ringe
const rings = [];
for (let i = 0; i < 17; i++) {
  const radius = 1.5 + i * 0.09;
  const ringGeo = new THREE.RingGeometry(radius - 0.02, radius + 0.02, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffa500,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.random() * Math.PI;
  ring.rotation.y = Math.random() * Math.PI;
  ring.userData = { speed: (Math.random() - 0.5) * 0.01 };
  scene.add(ring);
  rings.push(ring);
}

// Fragmente + Linien
const fragments = [];
const lines = [];

const fragGeo = new THREE.IcosahedronGeometry(0.05, 0);
const fragMat = new THREE.MeshBasicMaterial({
  color: 0xffa500,
  transparent: true,
  opacity: 0.6
});

for (let i = 0; i < 100; i++) {
  const frag = new THREE.Mesh(fragGeo, fragMat.clone());
  frag.position.set(
    (Math.random() - 0.5) * 0.5,
    (Math.random() - 0.5) * 0.5,
    (Math.random() - 0.5) * 0.5
  );
  frag.userData = {
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 0.008,
      (Math.random() - 0.5) * 0.008,
      (Math.random() - 0.5) * 0.008
    ),
    lineProgress: 0,
    lineSpeed: 0.5 + Math.random() * 1,
    impulse: 0,
    impulseCooldown: 0
  };
  fragments.push(frag);
  scene.add(frag);

  const points = [new THREE.Vector3(0, 0, 0), frag.position.clone()];
  const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xffa500,
    transparent: true,
    opacity: 0.4
  });
  const line = new THREE.Line(lineGeo, lineMat);
  lines.push(line);
  scene.add(line);
}

// Animationslogik
const clock = new THREE.Clock();
const v0 = new THREE.Vector3();
const v1 = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  // Kugelrotation
  sphere.rotation.y += 0.002;

  // Ringe drehen
  rings.forEach((ring) => {
    ring.rotation.y += ring.userData.speed;
  });

  // Pulsierender innerer Kern
  const pulseScale = 1 + Math.sin(elapsed * 3) * 0.02;
  innerSphere.scale.set(pulseScale, pulseScale, pulseScale);

  fragments.forEach((frag, i) => {
    frag.position.add(frag.userData.velocity);

    // Reichweitenbegrenzung
    if (frag.position.length() > 2.2) {
      frag.position.set(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5
      );
      frag.userData.lineProgress = 0;
      frag.userData.impulse = 0;
      frag.userData.impulseCooldown = 0;
    }

    // Linienanimation
    frag.userData.lineProgress = Math.min(
      frag.userData.lineProgress + frag.userData.lineSpeed * delta,
      1
    );
    v0.set(0, 0, 0);
    v1.copy(frag.position).multiplyScalar(frag.userData.lineProgress);
    lines[i].geometry.setFromPoints([v0.clone(), v1.clone()]);

    // Impulse
    if (frag.userData.impulseCooldown <= 0 && Math.random() < 0.003) {
      frag.userData.impulse = 1;
      frag.userData.impulseCooldown = 200;
    }

    if (frag.userData.impulse > 0) {
      frag.userData.impulse -= 0.05;
    } else {
      frag.userData.impulse = 0;
    }

    frag.userData.impulseCooldown--;

    const pulse = 0.3 + Math.abs(Math.sin(elapsed * 2 + i)) * 0.7;
    const finalOpacity = Math.min(1.0, pulse + frag.userData.impulse);
    lines[i].material.opacity = finalOpacity;
  });

  renderer.render(scene, camera);
}

animate();

// Responsives Verhalten
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

//Button
const holoButton = document.getElementById("holo-toggle");
const icon = holoButton.querySelector(".icon");

let isPlaying = false;

holoButton.addEventListener("click", () => {
    isPlaying = !isPlaying;

    icon.className = "icon " + (isPlaying ? "pause" : "play");
});