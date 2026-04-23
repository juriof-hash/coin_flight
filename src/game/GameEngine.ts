import * as THREE from 'three';

export interface GameState {
  score: number;
  timeLeft: number;
  gameSpeed: number;
  distance: number;
  isGameOver: boolean;
  stage: 'Meadow' | 'Ocean' | 'City' | 'Space';
  coinsCollected: number;
  survivedTime: number;
}

export class GameEngine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public plane: THREE.Group;
  
  private clock: THREE.Clock;
  private mouse = new THREE.Vector2();
  private targetX = 0;
  private targetY = 0;
  
  private state: GameState;
  private onStateUpdate: (state: GameState) => void;
  
  // Game objects
  private worldObjects: THREE.Group;
  private obstacles: THREE.Object3D[] = [];
  private coins: THREE.Object3D[] = [];
  
  private lastDifficultyIncrease = 0;
  private lastStateUpdateTime = 0;
  private gameActive = false;

  constructor(container: HTMLElement, onStateUpdate: (state: GameState) => void) {
    this.onStateUpdate = onStateUpdate;
    this.state = this.getInitialState();
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020617);
    this.scene.fog = new THREE.Fog(0x020617, 100, 400);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 20);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();

    this.worldObjects = new THREE.Group();
    this.scene.add(this.worldObjects);

    this.initLights();
    this.initPlayer();
    this.initWorld();
    
    window.addEventListener('resize', this.onResize.bind(this));
    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('touchstart', this.onTouchMove.bind(this));
    window.addEventListener('touchmove', this.onTouchMove.bind(this));
    
    this.animate();
  }

  private getInitialState(): GameState {
    return {
      score: 0,
      timeLeft: 30,
      gameSpeed: 1.0,
      distance: 0,
      isGameOver: false,
      stage: 'Meadow',
      coinsCollected: 0,
      survivedTime: 0,
    };
  }

  private initLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    this.scene.add(dirLight);
  }

  private initPlayer() {
    this.plane = new THREE.Group();
    
    // Body (Main fuselage)
    const bodyGeom = new THREE.BoxGeometry(1, 0.6, 2);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xef4444 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    this.plane.add(body);

    // Wings
    const wingGeom = new THREE.BoxGeometry(4, 0.1, 0.8);
    const wingMat = new THREE.MeshPhongMaterial({ color: 0xef4444 });
    const wings = new THREE.Mesh(wingGeom, wingMat);
    wings.position.y = 0.1;
    wings.castShadow = true;
    this.plane.add(wings);

    // Tail
    const tailGeom = new THREE.BoxGeometry(0.1, 0.8, 0.6);
    const tailMat = new THREE.MeshPhongMaterial({ color: 0xdc2626 });
    const tail = new THREE.Mesh(tailGeom, tailMat);
    tail.position.set(0, 0.5, 0.8);
    tail.castShadow = true;
    this.plane.add(tail);

    // Propeller
    const propGeom = new THREE.BoxGeometry(1.2, 0.1, 0.05);
    const propMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const prop = new THREE.Mesh(propGeom, propMat);
    prop.position.z = -1.05;
    prop.name = 'propeller';
    this.plane.add(prop);

    this.scene.add(this.plane);
  }

  private initWorld() {
    // Basic floor for Meadow
    const floorGeom = new THREE.PlaneGeometry(1000, 1000);
    const floorMat = new THREE.MeshPhongMaterial({ color: 0x4ade80 });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -10;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private spawnObject() {
    if (this.state.isGameOver || !this.gameActive) return;

    const type = Math.random();
    let obj: THREE.Object3D;
    
    if (type < 0.15) {
      // Red Coin (+10s)
      obj = this.createCoin(0xef4444, 'red');
    } else if (type < 0.4) {
      // Gold Coin (+2)
      obj = this.createCoin(0xfacc15, 'gold');
    } else if (type < 0.7) {
      // Silver Coin (+1)
      obj = this.createCoin(0xe2e8f0, 'silver');
    } else {
      // Obstacle
      obj = this.createObstacle();
    }

    obj.position.set(
      (Math.random() - 0.5) * 40,
      (Math.random() - 0.5) * 20 + 2,
      -300
    );
    this.worldObjects.add(obj);

    if (obj.userData.isCoin) this.coins.push(obj);
    else this.obstacles.push(obj);
  }

  private createCoin(color: number, type: string) {
    const group = new THREE.Group();
    const geom = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 8);
    const mat = new THREE.MeshPhongMaterial({ 
      color, 
      emissive: color, 
      emissiveIntensity: 0.5,
      shininess: 100
    });
    const coin = new THREE.Mesh(geom, mat);
    coin.rotation.x = Math.PI / 2;
    group.add(coin);

    // Inner detail
    const innerGeom = new THREE.TorusGeometry(0.5, 0.05, 8, 16);
    const innerMat = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0xffffff });
    const inner = new THREE.Mesh(innerGeom, innerMat);
    group.add(inner);

    group.userData = { isCoin: true, type, radius: 2 }; // Generous hitbox
    return group;
  }

  private createObstacle() {
    const group = new THREE.Group();
    let geom: THREE.BufferGeometry;
    let color: number;

    if (this.state.stage === 'Meadow') {
      // Bird-like simple mesh
      geom = new THREE.ConeGeometry(1, 2, 4);
      color = 0x78350f;
    } else if (this.state.stage === 'Ocean') {
      // Buoy or simple drone
      geom = new THREE.SphereGeometry(1.2, 5, 5);
      color = 0xef4444;
    } else if (this.state.stage === 'City') {
      // Drone/Tech 
      geom = new THREE.BoxGeometry(2, 0.5, 2);
      color = 0x334155;
    } else {
      // Meteorite (Space)
      geom = new THREE.IcosahedronGeometry(1.8, 0);
      color = 0x4b5563;
    }

    const mat = new THREE.MeshPhongMaterial({ color, flatShading: true });
    const mesh = new THREE.Mesh(geom, mat);
    if (this.state.stage === 'Meadow') mesh.rotation.x = Math.PI / 2;
    group.add(mesh);

    group.userData = { isObstacle: true, radius: 1.0 }; // Strict hitbox
    return group;
  }

  private onMouseMove(e: MouseEvent) {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.targetX = this.mouse.x * 25;
    this.targetY = this.mouse.y * 15;
  }

  private onTouchMove(e: TouchEvent) {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      this.mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
      this.targetX = this.mouse.x * 25;
      this.targetY = this.mouse.y * 15;
    }
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public start() {
    this.state = this.getInitialState();
    this.gameActive = true;
    this.lastDifficultyIncrease = this.clock.getElapsedTime();
    this.worldObjects.clear();
    this.obstacles = [];
    this.coins = [];
    this.onStateUpdate(this.state);
  }

  private gameOver() {
    this.state.isGameOver = true;
    this.gameActive = false;
    
    // Final score calculation
    this.state.score = (this.state.coinsCollected) + (Math.floor(this.state.survivedTime) * 5);
    this.onStateUpdate(this.state);
  }

  private updateLogic(delta: number) {
    if (this.state.isGameOver || !this.gameActive) return;

    // Timer
    this.state.timeLeft -= delta;
    this.state.survivedTime += delta;
    
    if (this.state.timeLeft <= 0) {
      this.gameOver();
      return;
    }

    // Difficulty Increase every 30s
    const elapsed = this.clock.getElapsedTime();
    if (elapsed - this.lastDifficultyIncrease >= 30) {
      this.state.gameSpeed *= 1.1;
      this.lastDifficultyIncrease = elapsed;
    }

    // Stage Transitions
    if (this.state.survivedTime > 90) this.state.stage = 'Space';
    else if (this.state.survivedTime > 60) this.state.stage = 'City';
    else if (this.state.survivedTime > 30) this.state.stage = 'Ocean';

    this.updateBackground();

    // Spawning frequency based on speed
    if (Math.random() < 0.05 * this.state.gameSpeed) {
      this.spawnObject();
    }

    // Move objects and collision
    const moveSpeed = 50 * this.state.gameSpeed * delta;
    
    [...this.coins, ...this.obstacles].forEach((obj, idx) => {
      obj.position.z += moveSpeed;
      
      // Collision detection
      const planePos = this.plane.position;
      const objPos = obj.position;
      const dist = planePos.distanceTo(objPos);
      
      if (dist < (obj.userData.radius + 1)) {
        if (obj.userData.isCoin) {
          this.collectCoin(obj.userData.type);
          this.removeObject(obj);
        } else {
          this.gameOver();
        }
      }

      // Cleanup
      if (obj.position.z > 30) {
        this.removeObject(obj);
      }
    });

    this.triggerStateUpdate();
  }

  private triggerStateUpdate() {
    const now = performance.now();
    if (now - this.lastStateUpdateTime > 100 || this.state.isGameOver) { 
      this.onStateUpdate({ ...this.state });
      this.lastStateUpdateTime = now;
    }
  }

  private collectCoin(type: string) {
    if (type === 'red') {
      this.state.timeLeft += 10;
      this.state.score += 5; // Bonus
    } else if (type === 'gold') {
      this.state.score += 2;
      this.state.coinsCollected += 2;
    } else {
      this.state.score += 1;
      this.state.coinsCollected += 1;
    }
  }

  private removeObject(obj: THREE.Object3D) {
    this.worldObjects.remove(obj);
    this.coins = this.coins.filter(c => c !== obj);
    this.obstacles = this.obstacles.filter(o => o !== obj);
  }

  private updateBackground() {
    let color: number;
    switch(this.state.stage) {
      case 'Ocean': color = 0x082f49; break; // Dark Blue
      case 'City': color = 0x1e293b; break; // Slate
      case 'Space': color = 0x020617; break; // Deep Space
      default: color = 0x064e3b; // Deep Forest (Meadow Hills Dark)
    }
    
    const currentColor = new THREE.Color(this.scene.background as THREE.Color);
    currentColor.lerp(new THREE.Color(color), 0.01);
    this.scene.background = currentColor;
    if (this.scene.fog) {
      (this.scene.fog as THREE.Fog).color = currentColor;
    }
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    const delta = this.clock.getDelta();

    if (this.gameActive) {
      this.updateLogic(delta);

      // Plane Movement Lerp
      this.plane.position.x += (this.targetX - this.plane.position.x) * 0.1;
      this.plane.position.y += (this.targetY - this.plane.position.y) * 0.1;

      // Plane Tilting
      this.plane.rotation.z = -(this.targetX - this.plane.position.x) * 0.1;
      this.plane.rotation.x = (this.targetY - this.plane.position.y) * 0.1;

      // Propeller rotation
      const prop = this.plane.getObjectByName('propeller');
      if (prop) prop.rotation.z += 0.5;

      // Camera Chase
      this.camera.position.x += (this.plane.position.x - this.camera.position.x) * 0.05;
      this.camera.lookAt(this.plane.position.x * 0.5, this.plane.position.y * 0.5, 0);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
