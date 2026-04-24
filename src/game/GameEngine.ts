import * as THREE from 'three';
import { EnvironmentManager } from './EnvironmentManager';

export interface GameState {
  score: number;
  timeLeft: number;
  gameSpeed: number;
  distance: number;
  isGameOver: boolean;
  isCrashing: boolean;
  stage: 'Meadow' | 'Ocean' | 'City' | 'Space';
  coinsCollected: number;
  survivedTime: number;
  isBossFight: boolean;
  bossTimeLeft: number;
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
  
  private isCrashingSequence = false;
  private crashTimer = 0;

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
  
  // Boss state
  private hasFoughtBoss = false;
  private bossGroup?: THREE.Group;
  private bossGuideLaser?: THREE.Mesh;
  private bossState: 'idle' | 'aiming' | 'dashing' | 'exiting' = 'idle';
  private bossActionTimer: number = 0;
  private bossTargetPos: THREE.Vector3 = new THREE.Vector3();
  
  private bossShotCount: number = 1;
  private bossProjectiles: { mesh: THREE.Mesh; velocity: THREE.Vector3 }[] = [];
  
  private envManager!: EnvironmentManager;
  
  // Speed Trails
  private speedLines?: THREE.InstancedMesh;
  private speedLineData: {x:number, y:number, z:number, speed:number}[] = [];
  
  private propeller?: THREE.Mesh;
  
  // Juice / Game Feel
  private audioCtx?: AudioContext;
  private audioListener!: THREE.AudioListener;
  private bossBGM?: THREE.Audio;
  private projectileSFX?: THREE.Audio;
  private comboStreak = 0;
  private lastCollectTime = 0;
  private particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; isHarmful?: boolean }[] = [];
  private uiContainer: HTMLElement;
  private cameraShakeIntensity = 0;

  private lastDifficultyIncrease = 0;
  private lastStateUpdateTime = 0;
  private gameActive = false;

  constructor(container: HTMLElement, onStateUpdate: (state: GameState) => void) {
    this.onStateUpdate = onStateUpdate;
    this.state = this.getInitialState();
    
    // UI Container for floating text
    this.uiContainer = document.createElement('div');
    this.uiContainer.style.position = 'absolute';
    this.uiContainer.style.top = '0';
    this.uiContainer.style.left = '0';
    this.uiContainer.style.width = '100%';
    this.uiContainer.style.height = '100%';
    this.uiContainer.style.pointerEvents = 'none';
    this.uiContainer.style.overflow = 'hidden';
    container.appendChild(this.uiContainer);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 20, 150);

    // Chase Cam Setup
    this.camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 6, 12);
    this.camera.lookAt(0, -2, -20);
    
    // Setup Audio Listener & Sounds
    this.audioListener = new THREE.AudioListener();
    this.camera.add(this.audioListener);

    this.bossBGM = new THREE.Audio(this.audioListener);
    this.projectileSFX = new THREE.Audio(this.audioListener);

    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('/bgm/boss1.mp3', (buffer) => {
        if (this.bossBGM) {
            this.bossBGM.setBuffer(buffer);
            this.bossBGM.setLoop(true);
            this.bossBGM.setVolume(0);
        }
    });
    audioLoader.load('/sfx/1.m4a', (buffer) => {
        if (this.projectileSFX) {
            this.projectileSFX.setBuffer(buffer);
            this.projectileSFX.setVolume(0.5);
        }
    });

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
    canvas.addEventListener('mousedown', () => {
        this.isMouseActive = true;
        this.initAudio();
    });
    
    window.addEventListener('mouseup', () => this.isMouseActive = false);
    
    canvas.addEventListener('touchstart', (e: TouchEvent) => {
        this.initAudio();
        this.onTouchStart(e);
    }, { passive: false });
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
      isCrashing: false,
      stage: 'Meadow',
      coinsCollected: 0,
      survivedTime: 0,
      isBossFight: false,
      bossTimeLeft: 0,
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
    this.envManager = new EnvironmentManager(this.scene);
    this.envManager.setStage(this.state?.stage || 'Meadow');

    // Speed lines (InstancedMesh)
    const lineCount = 100;
    const lineGeom = new THREE.BoxGeometry(0.1, 0.1, 4);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
    this.speedLines = new THREE.InstancedMesh(lineGeom, lineMat, lineCount);
    const dummy = new THREE.Object3D();
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

  private startBossFight() {
    this.hasFoughtBoss = true;
    this.state.isBossFight = true;
    this.state.bossTimeLeft = 10;
    
    // Crossfade BGM
    this.initAudio();
    if (this.bossBGM && !this.bossBGM.isPlaying && this.bossBGM.buffer) {
       this.bossBGM.setVolume(0);
       this.bossBGM.play();
       const ctx = this.audioListener.context;
       this.bossBGM.gain.gain.cancelScheduledValues(ctx.currentTime);
       this.bossBGM.gain.gain.setValueAtTime(0, ctx.currentTime);
       this.bossBGM.gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.5);
    }
    
    // Create Boss Model (Faceted Phoenix - Low poly)
    this.bossGroup = new THREE.Group();
    const scale = 5;
    
    // Phoenix Body (crystalline/faceted cone)
    const bodyGeom = new THREE.ConeGeometry(0.8 * scale, 3 * scale, 6);
    const bodyMat = new THREE.MeshPhongMaterial({ 
        color: 0xff3300, 
        emissive: 0xaa2200, 
        flatShading: true,
        transparent: true,
        opacity: 0.9
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.rotation.x = -Math.PI / 2;
    
    // Phoenix Wings (faceted irregular shapes)
    // Custom shape for a fiery wing
    const wingShape = new THREE.Shape([
        new THREE.Vector2(0, 0),
        new THREE.Vector2(3, -0.5),
        new THREE.Vector2(3.5, 1),
        new THREE.Vector2(1.5, 0.5),
        new THREE.Vector2(0.5, 2),
    ]);
    const wingGeom = new THREE.ExtrudeGeometry(wingShape, { depth: 0.2 * scale, bevelEnabled: false });
    // Center the wing geometry
    wingGeom.translate(0, 0, -0.1 * scale);

    const wingMat = new THREE.MeshPhongMaterial({ 
        color: 0xffaa00, 
        emissive: 0xdd4400, 
        flatShading: true,
        side: THREE.DoubleSide 
    });
    
    const leftWing = new THREE.Mesh(wingGeom, wingMat);
    leftWing.scale.set(scale * 0.8, scale * 0.8, scale * 0.8);
    leftWing.position.set(0.5 * scale, 0, 0);

    const rightWing = new THREE.Mesh(wingGeom, wingMat);
    rightWing.scale.set(scale * 0.8, scale * 0.8, scale * 0.8);
    rightWing.rotation.x = Math.PI; // flip
    rightWing.position.set(-0.5 * scale, 0, 0);
    
    const leftPivot = new THREE.Group();
    leftPivot.position.set(0.2 * scale, 0, 0.2 * scale);
    leftPivot.add(leftWing);
    
    const rightPivot = new THREE.Group();
    rightPivot.position.set(-0.2 * scale, 0, 0.2 * scale);
    rightPivot.add(rightWing);
    
    // Intense Point Light to illuminate trees red
    const bossLight = new THREE.PointLight(0xff2200, 10, 100);
    
    this.bossGroup.add(body, leftPivot, rightPivot, bossLight);
    this.bossGroup.userData = { radius: 2.0 * scale, leftWing: leftPivot, rightWing: rightPivot };
    
    // Position boss in front of camera
    this.bossGroup.position.set(0, 10, -80);
    this.bossGroup.rotation.y = Math.PI; // Face the player
    this.worldObjects.add(this.bossGroup);
    
    this.bossState = 'aiming'; // We'll repurpose 'aiming' as 'active' for this step, or rename. Let's just use 'aiming' for active state.
    this.bossActionTimer = 0;
    this.bossShotCount = 1;
  }

  private updateBossFight(delta: number) {
    if (!this.bossGroup) return;

    // Wing flap animation
    const time = this.clock.getElapsedTime();
    const lw = this.bossGroup.userData.leftWing;
    const rw = this.bossGroup.userData.rightWing;
    if (lw && rw) {
       lw.rotation.y = Math.sin(time * 15) * 0.3;
       rw.rotation.y = -Math.sin(time * 15) * 0.3;
    }

    // Fire trail particles
    if (Math.random() < 0.8) {
        const geom = new THREE.BoxGeometry(2, 2, 2);
        // Random orange/yellow/red color
        const colors = [0xff2200, 0xff7700, 0xffaa00];
        const mat = new THREE.MeshBasicMaterial({ 
            color: colors[Math.floor(Math.random() * colors.length)], 
            transparent: true, 
            opacity: 0.8 
        });
        const p = new THREE.Mesh(geom, mat);
        p.position.copy(this.bossGroup.position);
        
        // Spread a bit behind and around
        p.position.x += (Math.random() - 0.5) * 4;
        p.position.y += (Math.random() - 0.5) * 4;
        p.position.z += 2; 

        // Particles float up and move towards player's world z (which is effectively positive z in local)
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.1) * 10,
            20 // Move towards player so it acts as an obstacle or just a visual trail that passes
        );
        this.worldObjects.add(p);
        this.particles.push({ mesh: p, velocity, life: 1.5, isHarmful: true });
    }

    this.bossActionTimer += delta;

    switch (this.bossState) {
      case 'aiming':
        // Boss moves in a pattern in front of player
        this.bossGroup.position.x = Math.sin(time * 2) * 15;
        this.bossGroup.position.y = 10 + Math.sin(time * 3) * 3;
        // Ensure boss stays firmly at z = -80 relative to the world, but since plane is at z=0, just fix it at -80.
        this.bossGroup.position.z = -80;

        // Shoot projectiles
        if (this.bossActionTimer > 0.8) {
          this.bossActionTimer = 0;
          this.fireBossProjectile();
          this.bossShotCount++;
        }
        break;

      case 'exiting':
        this.bossGroup.position.y += delta * 20; // Fly up
        this.bossGroup.position.z -= delta * 50;
        if (this.bossGroup.position.y > 100) {
            this.worldObjects.remove(this.bossGroup);
            this.bossGroup = undefined;
        }
        break;
    }

    // Update projectiles
    const moveSpeed = 50 * this.state.gameSpeed * delta;
    for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
        const proj = this.bossProjectiles[i];
        
        // Projectile moves towards player based on velocity, PLUS the world movement speed coming at player
        proj.mesh.position.addScaledVector(proj.velocity, delta);
        proj.mesh.position.z += moveSpeed;

        // Collision check with plane
        const distZ = Math.abs(proj.mesh.position.z - this.plane.position.z);
        const distXY = Math.hypot(proj.mesh.position.x - this.plane.position.x, proj.mesh.position.y - this.plane.position.y);
        
        if (distZ < 3 && distXY < 2.5) {
            this.onCrash();
        }

        // Clean up if passed player
        if (proj.mesh.position.z > 20) {
            this.worldObjects.remove(proj.mesh);
            this.bossProjectiles.splice(i, 1);
        }
    }
  }

  private fireBossProjectile() {
    if (!this.bossGroup) return;

    if (this.projectileSFX && this.projectileSFX.buffer) {
        if (this.projectileSFX.isPlaying) this.projectileSFX.stop();
        this.projectileSFX.play();
    }

    const target = this.plane.position.clone();
    const baseDirection = new THREE.Vector3().subVectors(target, this.bossGroup.position).normalize();
    const projSpeed = 40;
    const spreadAngle = Math.PI / 4; // 45 degrees spread total
    const count = this.bossShotCount;

    for (let i = 0; i < count; i++) {
        const projGeom = new THREE.SphereGeometry(1.5, 16, 16);
        const projMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xaa0000 });
        const mesh = new THREE.Mesh(projGeom, projMat);
        
        // Spawn at boss position
        mesh.position.copy(this.bossGroup.position);
        this.worldObjects.add(mesh);

        let angleOffset = 0;
        if (count > 1) {
             const t = i / (count - 1); // 0 to 1
             angleOffset = -spreadAngle/2 + t * spreadAngle;
        }

        // Apply spread by rotating around the Y axis
        const axis = new THREE.Vector3(0, 1, 0);
        const direction = baseDirection.clone().applyAxisAngle(axis, angleOffset);
        
        const velocity = direction.multiplyScalar(projSpeed);

        this.bossProjectiles.push({ mesh, velocity });
    }
  }

  private endBossFight() {
    this.state.isBossFight = false;
    this.bossState = 'exiting';
    this.state.stage = 'Ocean';
    this.envManager.setStage(this.state.stage);
    
    this.state.timeLeft += 5; // Bonus
    this.onStateUpdate(this.state);

    if (this.bossBGM && this.bossBGM.isPlaying) {
      const ctx = this.audioListener.context;
      const currentVol = this.bossBGM.getVolume();
      this.bossBGM.gain.gain.cancelScheduledValues(ctx.currentTime);
      this.bossBGM.gain.gain.setValueAtTime(currentVol, ctx.currentTime);
      this.bossBGM.gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.5); // WebAudio doesn't like ramping to exact 0 sometimes
      setTimeout(() => {
          this.bossBGM?.stop();
      }, 500);
    }
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

  private initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(console.error);
    }
    if (this.audioListener.context.state === 'suspended') {
      this.audioListener.context.resume().catch(console.error);
    }
  }

  public start() {
    this.initAudio();
    this.state = this.getInitialState();
    this.envManager.setStage(this.state.stage, true);
    this.gameActive = true;
    this.isCrashingSequence = false;
    this.crashTimer = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.touchStartPoint.set(0, 0);
    this.initialTargetAtStart.set(0, 0);
    this.mouse.set(0, 0);
    this.hasFoughtBoss = false;
    if (this.bossGroup) {
      this.worldObjects.remove(this.bossGroup);
      this.bossGroup = undefined;
    }
    for (const proj of this.bossProjectiles) {
        this.worldObjects.remove(proj.mesh);
    }
    this.bossProjectiles = [];
    this.bossState = 'idle';
    this.bossActionTimer = 0;
    
    if (this.plane) {
        this.plane.position.set(0, 0, 0);
        this.plane.rotation.set(0, 0, 0);
        this.plane.visible = true;
    }
    this.lastDifficultyIncrease = this.clock.getElapsedTime();
    this.worldObjects.clear();
    this.obstacles = [];
    this.coins = [];
    this.onStateUpdate(this.state);
  }

  private playCrashSound() {
    this.initAudio();
    if (!this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, this.audioCtx.currentTime + 0.5);
    
    gain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.5);
    
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    
    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.5);
  }

  private createExplosionParticles(pos: THREE.Vector3) {
    const colors = [0xef4444, 0xf97316, 0xfacc15, 0x334155, 0xffffff];
    const geom = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    
    for (let i = 0; i < 40; i++) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        const mat = new THREE.MeshPhongMaterial({ color, flatShading: true });
        const p = new THREE.Mesh(geom, mat);
        p.position.copy(pos);
        p.position.add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2));
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 60,
            (Math.random() - 0.5) * 60 + 20,
            (Math.random() - 0.5) * 60
        );
        this.worldObjects.add(p);
        this.particles.push({ mesh: p, velocity, life: 2.0 });
    }
  }

  private onCrash() {
    if (this.isCrashingSequence) return;
    this.isCrashingSequence = true;
    this.crashTimer = 1.5;
    this.state.isCrashing = true;
    
    this.playCrashSound();
    
    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate([200, 100, 200]);
    }

    this.createExplosionParticles(this.plane.position);
    this.plane.visible = false;
    this.cameraShakeIntensity = 2.0;

    this.onStateUpdate(this.state);
  }

  private gameOver() {
    this.state.isGameOver = true;
    this.state.isCrashing = false;
    this.gameActive = false;
    
    // Final score calculation
    this.state.score = (this.state.coinsCollected) + (Math.floor(this.state.survivedTime) * 5);
    this.onStateUpdate(this.state);
  }

  private updateLogic(delta: number) {
    if (this.state.isGameOver || !this.gameActive) return;

    if (!this.state.isBossFight) {
      // Normal Timer
      this.state.timeLeft -= delta;
      this.state.survivedTime += delta;
    } else {
      // Boss Timer
      this.state.bossTimeLeft -= delta;
      if (this.state.bossTimeLeft <= 0 && this.bossState !== 'exiting') {
        this.endBossFight();
      }
    }
    
    // Always check for game over based on total time left (which acts as health)
    if (this.state.timeLeft <= 0) {
      this.state.timeLeft = 0;
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
    const prevStage = this.state.stage;
    if (this.state.stage === 'Meadow' && this.state.survivedTime >= 30 && !this.hasFoughtBoss) {
        this.startBossFight();
    } else if (this.state.survivedTime > 90) {
        this.state.stage = 'Space';
    } else if (this.state.survivedTime > 60) {
        this.state.stage = 'City';
    }

    if (prevStage !== this.state.stage) {
       this.envManager.setStage(this.state.stage);
    }

    this.updateBackground(delta);

    if (this.state.isBossFight || this.bossState === 'exiting') {
        this.updateBossFight(delta);
    }
    
    if (!this.state.isBossFight) {
        // Spawning frequency based on speed
        if (Math.random() < 0.05 * this.state.gameSpeed) {
          this.spawnObject();
        }
    }

    // Move objects and collision
    const moveSpeed = 50 * this.state.gameSpeed * delta;
    
    [...this.coins, ...this.obstacles].forEach((obj) => {
      // Magnetic effect for coins
      const planePos = this.plane.position;
      const objPos = obj.position;
      
      let magneticActive = false;
      if (obj.userData.isCoin && planePos.distanceTo(objPos) < 10) {
          // Pull coin towards the plane faster
          objPos.lerp(planePos, delta * 18);
          // Scale ping effect
          const currentScale = obj.scale.x;
          obj.scale.setScalar(Math.min(currentScale + delta * 8, 2.0));
          magneticActive = true;
      }
      
      // Only move by world speed if not being magnetically pulled strongly
      if (!magneticActive) {
          obj.position.z += moveSpeed;
      } else {
          // If it's in front of the plane, still let it come towards us quickly
          if (obj.position.z < planePos.z) {
             obj.position.z += moveSpeed;
          }
      }
      
      // Convert to XY dist for chase-cam depth
      const distXY = Math.sqrt(Math.pow(planePos.x - objPos.x, 2) + Math.pow(planePos.y - objPos.y, 2));
      const distZ = Math.abs(planePos.z - objPos.z);
      
      // True collision (collected)
      if (distXY < (obj.userData.radius + 1.5) && distZ < 3.5) {
        if (obj.userData.isCoin) {
          if (!this.isCrashingSequence) {
            this.collectCoin(obj);
          }
          return; // Object is removed
        } else {
          this.onCrash();
        }
      } else if (distXY < 3 && distZ < 6 && obj.userData.isCoin && magneticActive) {
         // Fallback boundary to prevent permanent orbiting
         if (!this.isCrashingSequence) {
            this.collectCoin(obj);
         }
         return;
      }


      // Cosmetic Updates
      if (obj.userData.isCoin && obj.userData.mesh) {
        obj.userData.mesh.rotation.y += delta * 3;
      }
      if (obj.userData.isObstacle && obj.userData.leftWing) {
        const flap = Math.sin(performance.now() * 0.01 + obj.userData.randomOffset) * 0.6;
        obj.userData.leftWing.rotation.z = flap;
        obj.userData.rightWing.rotation.z = -flap;
      }

      // Cleanup if missed
      if (obj.position.z > 30) {
        this.removeObject(obj);
      }
    });

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= delta * 1.5;
        if (p.life <= 0) {
            this.worldObjects.remove(p.mesh);
            p.mesh.geometry.dispose();
            (p.mesh.material as THREE.Material).dispose();
            this.particles.splice(i, 1);
        } else {
            p.mesh.position.addScaledVector(p.velocity, delta);
            p.mesh.rotation.x += delta * Math.random() * 5;
            p.mesh.rotation.y += delta * Math.random() * 5;
            p.mesh.scale.setScalar(p.life);
            // Gravity effect on particles
            p.velocity.y -= delta * 20;

            // Collision check if it's a harmful particle (like boss fire trail)
            if (p.isHarmful && Math.abs(p.mesh.position.z - this.plane.position.z) < 2) {
                const distXY = Math.hypot(p.mesh.position.x - this.plane.position.x, p.mesh.position.y - this.plane.position.y);
                if (distXY < 2.5) { // Roughly plane size + particle size
                    this.onCrash();
                }
            }
        }
    }

    // Update Environment Instanced Meshes
    const dummy = new THREE.Object3D();
    this.envManager.update(moveSpeed, delta);
    
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

  // --- JUICE: AUDIO ---
  private playCollectSound() {
    this.initAudio();
    if (!this.audioCtx) return;

    const now = performance.now();
    if (now - this.lastCollectTime < 1000) {
      this.comboStreak = Math.min(this.comboStreak + 1, 10);
    } else {
      this.comboStreak = 0;
    }
    this.lastCollectTime = now;
    
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    const pitch = 1.0 + (this.comboStreak * 0.1);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600 * pitch, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200 * pitch, this.audioCtx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    
    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.1);
  }

  // --- JUICE: PARTICLES ---
  private createCoinParticles(pos: THREE.Vector3, color: number) {
    const geom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const mat = new THREE.MeshPhongMaterial({ color, flatShading: true });
    
    for (let i = 0; i < 6; i++) {
        const p = new THREE.Mesh(geom, mat);
        p.position.copy(pos);
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 40,
            (Math.random() - 0.5) * 40,
            (Math.random() - 0.5) * 40
        );
        this.worldObjects.add(p);
        this.particles.push({ mesh: p, velocity, life: 1.0 });
    }
  }

  // --- JUICE: FLOATING TEXT ---
  private showFloatingText(pos: THREE.Vector3, text: string, color: string) {
    const p = pos.clone();
    p.project(this.camera);
    const x = (p.x * .5 + .5) * window.innerWidth;
    const y = (p.y * -.5 + .5) * window.innerHeight;

    const el = document.createElement('div');
    el.textContent = text;
    el.style.position = 'absolute';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    el.style.fontWeight = '900';
    el.style.fontSize = '28px';
    el.style.textShadow = '0 3px 0 #000, 3px 0 0 #000, -3px 0 0 #000, 0 -3px 0 #000';
    el.style.transition = 'all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    el.style.transform = 'translate(-50%, -50%)';
    this.uiContainer.appendChild(el);

    // trigger reflow
    void el.offsetWidth;
    
    el.style.top = `${y - 120}px`;
    el.style.opacity = '0';
    
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 800);
  }

  // --- JUICE: CAMERA SHAKE ---
  private applyCameraShake() {
      this.cameraShakeIntensity = 0.8;
  }

  private collectCoin(obj: THREE.Object3D) {
    const type = obj.userData.type;
    const pos = obj.position.clone();
    
    this.playCollectSound();
    
    // Haptic feedback
    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }

    if (type === 'red') {
      this.state.timeLeft += 10;
      this.state.score += 5; // Bonus
      this.applyCameraShake();
      this.createCoinParticles(pos, 0xef4444);
      this.showFloatingText(pos, '+10s / +5', '#ef4444');
    } else if (type === 'gold') {
      this.state.score += 2;
      this.state.coinsCollected += 2;
      this.applyCameraShake();
      this.createCoinParticles(pos, 0xfacc15);
      this.showFloatingText(pos, '+2', '#facc15');
    } else {
      this.state.score += 1;
      this.state.coinsCollected += 1;
      this.createCoinParticles(pos, 0x94a3b8);
      this.showFloatingText(pos, '+1', '#ffffff');
    }
    
    this.removeObject(obj);
  }

  private removeObject(obj: THREE.Object3D) {
    this.worldObjects.remove(obj);
    this.coins = this.coins.filter(c => c !== obj);
    this.obstacles = this.obstacles.filter(o => o !== obj);
  }

  private updateBackground(delta: number) {
    let color: number;
    switch(this.state.stage) {
      case 'Ocean': color = 0x0ea5e9; break; // Sky blue 500
      case 'City': color = 0x1e293b; break; // Slate
      case 'Space': color = 0x020617; break; // Deep Space
      default: color = 0x87ceeb; // Light Sky Blue
    }
    
    const currentColor = new THREE.Color(this.scene.background as THREE.Color);
    currentColor.lerp(new THREE.Color(color), delta * 0.5);
    this.scene.background = currentColor;
    if (this.scene.fog) {
      (this.scene.fog as THREE.Fog).color = currentColor;
    }
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    const rawDelta = this.clock.getDelta();
    let delta = rawDelta;

    if (this.gameActive && this.isCrashingSequence) {
        delta = rawDelta * 0.2; // 0.2x slow motion
        this.crashTimer -= rawDelta;
        if (this.crashTimer <= 0) {
            this.gameOver();
        }
    }

    if (this.gameActive) {
      this.updateLogic(delta);

      if (!this.isCrashingSequence) {
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
      }

      // Camera Chase Tracking
      const targetCamY = this.state.isBossFight ? 10 : 6;
      const targetCamZ = this.state.isBossFight ? 16 : 12;

      this.camera.position.x += (this.plane.position.x * 0.5 - this.camera.position.x) * 0.1;
      this.camera.position.y += ((this.plane.position.y * 0.3 + targetCamY) - this.camera.position.y) * 0.1;
      this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.05;
      
      this.camera.lookAt(this.plane.position.x * 0.3, this.plane.position.y * 0.3 - 2, -20);
      
      // Apply Camera Shake (use rawDelta so shake is fast)
      if (this.cameraShakeIntensity > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.cameraShakeIntensity;
        this.camera.position.y += (Math.random() - 0.5) * this.cameraShakeIntensity;
        this.cameraShakeIntensity = Math.max(0, this.cameraShakeIntensity - rawDelta * 4);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
