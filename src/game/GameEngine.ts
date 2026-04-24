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
  private touchStartPoint = new THREE.Vector2();
  private initialTargetAtStart = new THREE.Vector2();
  private isTouching = false;
  private isMouseActive = false;
  
  private targetX = 0;
  private targetY = 0;
  
  private readonly LIMIT_X = 18;
  private readonly LIMIT_Y = 10;
  private readonly SENSITIVITY = 0.9;
  
  private state: GameState;
  private onStateUpdate: (state: GameState) => void;
  
  // Game objects
  private worldObjects: THREE.Group;
  private obstacles: THREE.Object3D[] = [];
  private coins: THREE.Object3D[] = [];
  
  // Instanced Meshes for Environment
  private treeTrunks?: THREE.InstancedMesh;
  private treeLeaves?: THREE.InstancedMesh;
  private treeData: {x:number, y:number, z:number, scale:number}[] = [];
  
  // Speed Trails
  private speedLines?: THREE.InstancedMesh;
  private speedLineData: {x:number, y:number, z:number, speed:number}[] = [];
  
  private propeller?: THREE.Mesh;
  
  private lastDifficultyIncrease = 0;
  private lastStateUpdateTime = 0;
  private gameActive = false;

  constructor(container: HTMLElement, onStateUpdate: (state: GameState) => void) {
    this.onStateUpdate = onStateUpdate;
    this.state = this.getInitialState();
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 20, 150);

    // Chase Cam Setup
    this.camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 6, 12);
    this.camera.lookAt(0, -2, -20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);
    const canvas = this.renderer.domElement;

    this.clock = new THREE.Clock();

    this.worldObjects = new THREE.Group();
    this.scene.add(this.worldObjects);

    this.initLights();
    this.initPlayer();
    this.initWorld();
    
    window.addEventListener('resize', this.onResize.bind(this));
    
    // Attach input listeners to the canvas element to avoid blocking UI interactions
    canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    canvas.addEventListener('mousedown', () => this.isMouseActive = true);
    
    window.addEventListener('mouseup', () => this.isMouseActive = false);
    
    canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
    canvas.addEventListener('touchcancel', this.onTouchEnd.bind(this));
    
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
    const ambientLight = new THREE.AmbientLight(0xfff0dd, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(20, 50, 20);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -30;
    dirLight.shadow.camera.right = 30;
    dirLight.shadow.camera.top = 30;
    dirLight.shadow.camera.bottom = -30;
    this.scene.add(dirLight);
  }

  private initPlayer() {
    this.plane = new THREE.Group();
    
    // Fuselage
    const fuselageGeom = new THREE.BoxGeometry(1.5, 1.5, 4);
    const fuselageMat = new THREE.MeshPhongMaterial({ color: 0xcc2222, flatShading: true });
    const fuselage = new THREE.Mesh(fuselageGeom, fuselageMat);
    fuselage.castShadow = true;
    this.plane.add(fuselage);
    
    // Wings
    const wingGeom = new THREE.BoxGeometry(7, 0.2, 1.5);
    const wingMat = new THREE.MeshPhongMaterial({ color: 0xeeeeee, flatShading: true });
    const topWing = new THREE.Mesh(wingGeom, wingMat);
    topWing.position.set(0, 0.8, 0.5);
    topWing.castShadow = true;
    const bottomWing = new THREE.Mesh(wingGeom, wingMat);
    bottomWing.position.set(0, -0.6, 0.5);
    bottomWing.castShadow = true;
    this.plane.add(topWing, bottomWing);
    
    // Wing struts
    const strutGeom = new THREE.BoxGeometry(0.1, 1.4, 0.1);
    const strutMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const strut1 = new THREE.Mesh(strutGeom, strutMat);
    strut1.position.set(3, 0.1, 0.5);
    const strut2 = new THREE.Mesh(strutGeom, strutMat);
    strut2.position.set(-3, 0.1, 0.5);
    this.plane.add(strut1, strut2);
    
    // Tail
    const tailWingGeom = new THREE.BoxGeometry(2.5, 0.2, 1);
    const tailWing = new THREE.Mesh(tailWingGeom, wingMat);
    tailWing.position.set(0, 0.2, 1.8);
    const rudderGeom = new THREE.BoxGeometry(0.2, 1.2, 1);
    const rudder = new THREE.Mesh(rudderGeom, fuselageMat);
    rudder.position.set(0, 0.8, 1.8);
    this.plane.add(tailWing, rudder);
    
    // Propeller
    this.propeller = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.3, 0.1), new THREE.MeshPhongMaterial({ color: 0x111111 }));
    this.propeller.position.set(0, 0, -2.1);
    this.propeller.name = 'propeller';
    this.plane.add(this.propeller);
    
    this.scene.add(this.plane);
  }

  private initWorld() {
    // Basic floor for Meadow
    const floorGeom = new THREE.PlaneGeometry(1000, 1000);
    const floorMat = new THREE.MeshPhongMaterial({ color: 0x2d8a4e, flatShading: true });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -10;
    floor.receiveShadow = true;
    this.scene.add(floor);
    
    // Instanced Trees
    const treeCount = 150;
    const trunkGeom = new THREE.CylinderGeometry(0.3, 0.5, 1.5, 5);
    const leavesGeom = new THREE.DodecahedronGeometry(2, 0);
    const trunkMat = new THREE.MeshPhongMaterial({ color: 0x5a4325, flatShading: true });
    const leavesMat = new THREE.MeshPhongMaterial({ color: 0x3a9e5b, flatShading: true });
    
    this.treeTrunks = new THREE.InstancedMesh(trunkGeom, trunkMat, treeCount);
    this.treeLeaves = new THREE.InstancedMesh(leavesGeom, leavesMat, treeCount);
    this.treeTrunks.castShadow = true;
    this.treeLeaves.castShadow = true;
    
    const dummy = new THREE.Object3D();
    for (let i = 0; i < treeCount; i++) {
      const x = (Math.random() - 0.5) * 150;
      const z = -Math.random() * 300;
      const scale = 0.6 + Math.random() * 0.8;
      this.treeData.push({ x, y: -10, z, scale });
      
      dummy.position.set(x, -10 + 0.75 * scale, z);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.treeTrunks.setMatrixAt(i, dummy.matrix);
      
      dummy.position.set(x, -10 + 2.5 * scale, z);
      dummy.updateMatrix();
      this.treeLeaves.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(this.treeTrunks);
    this.scene.add(this.treeLeaves);

    // Speed lines (InstancedMesh)
    const lineCount = 100;
    const lineGeom = new THREE.BoxGeometry(0.1, 0.1, 4);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
    this.speedLines = new THREE.InstancedMesh(lineGeom, lineMat, lineCount);
    for(let i=0; i<lineCount; i++) {
      const x = (Math.random() - 0.5) * 60;
      const y = (Math.random() - 0.5) * 40;
      const z = -Math.random() * 200;
      const speed = 100 + Math.random() * 100;
      this.speedLineData.push({x, y, z, speed});
      dummy.position.set(x, y, z);
      dummy.scale.set(1,1,1);
      dummy.updateMatrix();
      this.speedLines.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(this.speedLines);
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
    const geom = new THREE.CylinderGeometry(1.2, 1.2, 0.4, 8); // Low-poly thick coin
    const mat = new THREE.MeshPhongMaterial({ 
      color, 
      emissive: color, 
      emissiveIntensity: 0.2,
      shininess: 100,
      flatShading: true
    });
    const coin = new THREE.Mesh(geom, mat);
    coin.rotation.x = Math.PI / 2;
    group.add(coin);

    group.userData = { isCoin: true, type, radius: 2, mesh: coin }; // Generous hitbox
    return group;
  }

  private createObstacle() {
    const group = new THREE.Group();
    
    if (this.state.stage === 'Meadow') {
      // Low-poly Eagle/Bird
      const bodyGeom = new THREE.ConeGeometry(0.8, 3, 4);
      const bodyMat = new THREE.MeshPhongMaterial({ color: 0x333333, flatShading: true });
      const body = new THREE.Mesh(bodyGeom, bodyMat);
      body.rotation.x = -Math.PI / 2;
      group.add(body);
      
      const wingGeom = new THREE.BoxGeometry(3, 0.2, 1);
      const wingMat = new THREE.MeshPhongMaterial({ color: 0x444444, flatShading: true });
      
      const leftWing = new THREE.Mesh(wingGeom, wingMat);
      leftWing.position.set(1.5, 0, 0);
      const rightWing = new THREE.Mesh(wingGeom, wingMat);
      rightWing.position.set(-1.5, 0, 0);
      
      const leftPivot = new THREE.Group();
      leftPivot.position.set(0.4, 0, 0.2);
      leftPivot.add(leftWing);
      
      const rightPivot = new THREE.Group();
      rightPivot.position.set(-0.4, 0, 0.2);
      rightPivot.add(rightWing);
      
      group.add(leftPivot, rightPivot);
      group.userData = { isObstacle: true, radius: 2.0, leftWing: leftPivot, rightWing: rightPivot, randomOffset: Math.random() * Math.PI * 2 };
    } else if (this.state.stage === 'Ocean') {
      const geom = new THREE.DodecahedronGeometry(1.5, 0);
      const color = 0xef4444;
      const mat = new THREE.MeshPhongMaterial({ color, flatShading: true });
      group.add(new THREE.Mesh(geom, mat));
      group.userData = { isObstacle: true, radius: 1.5 };
    } else {
      const geom = new THREE.IcosahedronGeometry(1.8, 0);
      const color = 0x4b5563;
      const mat = new THREE.MeshPhongMaterial({ color, flatShading: true });
      group.add(new THREE.Mesh(geom, mat));
      group.userData = { isObstacle: true, radius: 1.8 };
    }

    return group;
  }

  private onMouseMove(e: MouseEvent) {
    this.isMouseActive = true;
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.targetX = this.mouse.x * this.LIMIT_X;
    this.targetY = this.mouse.y * this.LIMIT_Y;
  }

  private onTouchStart(e: TouchEvent) {
    if (e.touches.length > 0) {
      e.preventDefault();
      this.isTouching = true;
      const touch = e.touches[0];
      this.touchStartPoint.set(touch.clientX, touch.clientY);
      this.initialTargetAtStart.set(this.targetX, this.targetY);
    }
  }

  private onTouchMove(e: TouchEvent) {
    if (e.touches.length > 0 && this.isTouching) {
      e.preventDefault();
      const touch = e.touches[0];
      
      const deltaX = touch.clientX - this.touchStartPoint.x;
      const deltaY = touch.clientY - this.touchStartPoint.y;
      
      const moveX = (deltaX / window.innerWidth) * 60 * this.SENSITIVITY;
      const moveY = -(deltaY / window.innerHeight) * 40 * this.SENSITIVITY;
      
      this.targetX = THREE.MathUtils.clamp(this.initialTargetAtStart.x + moveX, -this.LIMIT_X, this.LIMIT_X);
      this.targetY = THREE.MathUtils.clamp(this.initialTargetAtStart.y + moveY, -this.LIMIT_Y, this.LIMIT_Y);
    }
  }

  private onTouchEnd() {
    this.isTouching = false;
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
      // Convert to XY dist for chase-cam depth (objects zip past z)
      const distXY = Math.sqrt(Math.pow(planePos.x - objPos.x, 2) + Math.pow(planePos.y - objPos.y, 2));
      const distZ = Math.abs(planePos.z - objPos.z);
      
      // Hitbox is slightly elongated on Z
      if (distXY < (obj.userData.radius + 1.5) && distZ < 2) {
        if (obj.userData.isCoin) {
          this.collectCoin(obj.userData.type);
          this.removeObject(obj);
        } else {
          this.gameOver();
        }
      }

      // Coin Rotation & Bird Flapping
      if (obj.userData.isCoin) {
        obj.userData.mesh.rotation.y += delta * 3;
      }
      if (obj.userData.isObstacle && obj.userData.leftWing) {
        const flap = Math.sin(performance.now() * 0.01 + obj.userData.randomOffset) * 0.6;
        obj.userData.leftWing.rotation.z = flap;
        obj.userData.rightWing.rotation.z = -flap;
      }

      // Cleanup
      if (obj.position.z > 30) {
        this.removeObject(obj);
      }
    });

    // Update Environment Instanced Meshes
    const dummy = new THREE.Object3D();
    if (this.treeTrunks && this.treeLeaves) {
      for (let i = 0; i < this.treeData.length; i++) {
        const t = this.treeData[i];
        t.z += moveSpeed;
        if (t.z > 20) {
          t.z = -300;
          t.x = (Math.random() - 0.5) * 150;
        }
        
        dummy.position.set(t.x, t.y + 0.75 * t.scale, t.z);
        dummy.scale.set(t.scale, t.scale, t.scale);
        dummy.updateMatrix();
        this.treeTrunks.setMatrixAt(i, dummy.matrix);
        
        dummy.position.set(t.x, t.y + 2.5 * t.scale, t.z);
        dummy.updateMatrix();
        this.treeLeaves.setMatrixAt(i, dummy.matrix);
      }
      this.treeTrunks.instanceMatrix.needsUpdate = true;
      this.treeLeaves.instanceMatrix.needsUpdate = true;
    }
    
    // Update Speed Trails
    if (this.speedLines) {
      for(let i=0; i<this.speedLineData.length; i++) {
        const s = this.speedLineData[i];
        s.z += s.speed * delta * this.state.gameSpeed;
        if(s.z > 20) {
          s.z = -200;
        }
        dummy.position.set(s.x, s.y, s.z);
        dummy.scale.set(1,1,1);
        dummy.updateMatrix();
        this.speedLines.setMatrixAt(i, dummy.matrix);
      }
      this.speedLines.instanceMatrix.needsUpdate = true;
    }

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
      case 'Ocean': color = 0x0ea5e9; break; // Sky blue 500
      case 'City': color = 0x1e293b; break; // Slate
      case 'Space': color = 0x020617; break; // Deep Space
      default: color = 0x87ceeb; // Light Sky Blue
    }
    
    const currentColor = new THREE.Color(this.scene.background as THREE.Color);
    currentColor.lerp(new THREE.Color(color), 0.005);
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

      // Return to center if no active input
      if (!this.isTouching && !this.isMouseActive) {
        this.targetX *= 0.95;
        this.targetY *= 0.95;
      }

      // Plane Movement Lerp
      this.plane.position.x += (this.targetX - this.plane.position.x) * 0.1;
      this.plane.position.y += (this.targetY - this.plane.position.y) * 0.1;

      // Plane Tilting (Banking and Pitching)
      this.plane.rotation.z = -(this.targetX - this.plane.position.x) * 0.1;
      this.plane.rotation.x = -(this.targetY - this.plane.position.y) * 0.1;

      // Propeller rotation
      const prop = this.plane.getObjectByName('propeller');
      if (prop) prop.rotation.z += 20 * delta;

      // Camera Chase Tracking
      this.camera.position.x += (this.plane.position.x * 0.5 - this.camera.position.x) * 0.1;
      this.camera.position.y += ((this.plane.position.y * 0.3 + 6) - this.camera.position.y) * 0.1;
      this.camera.lookAt(this.plane.position.x * 0.3, this.plane.position.y * 0.3 - 2, -20);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
