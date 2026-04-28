import * as THREE from 'three';
import { EnvironmentManager } from './EnvironmentManager';
import { Howl } from 'howler';

export const gameSounds = {
  warning: new Howl({ src: ['warning_siren.mp3'], loop: true, volume: 0.5 }),
  bossEntry: new Howl({ src: ['boss_impact.mp3'], volume: 1.0 })
};

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
  stageProgress: number; // 0 to 1
  loopCount: number;
  isHellWarning?: boolean;
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
  
  private lastDebugKey: string = '';
  private debugKeyCounters: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };

  // Boss state
  private hasFoughtBoss = false;
  private hasFoughtBoss2 = false;
  private hasFoughtBoss3 = false;
  private currentBossLevel = 1;
  private bossEvadeCount = 0;
  private bossGroup?: THREE.Group;
  private bossGuideLaser?: THREE.Mesh;
  private bossState: 'idle' | 'aiming' | 'dashing' | 'retreating' | 'exiting' = 'idle';
  private bossActionTimer: number = 0;
  private bossTargetPos: THREE.Vector3 = new THREE.Vector3();
  private isHellWarningActive: boolean = false;
  private hellWarningTimer: number = 0;
  
  private bossShotCount: number = 1;
  private stage1AttackN: number = 1;
  private stage3AttackN: number = 1;
  private burstsFiredInCycle: number = 0;
  private stage1CycleCount: number = 1;
  private stage1LaserPhase: number = 0; // 0=normal, 1=aiming, 2=warning, 3=firing, 4=cooldown
  private stage1LaserTimer: number = 0;
  private stage1LaserTargetY: number = 0;
  private stage1LaserWarningMesh?: THREE.Mesh;
  private stage1LaserMesh?: THREE.Mesh;
  
  private currentAttackPhase: number = 1;
  private hasFoughtBoss4 = false;
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
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    
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
      stageProgress: 0,
      loopCount: 0,
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

  private triggerHellWarning() {
    this.isHellWarningActive = true;
    this.hellWarningTimer = 0;
    this.state.isHellWarning = true;
    this.state.isBossFight = true; // Set to true immediately to stop normal timer and spawning
    this.onStateUpdate({ ...this.state });
    
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      Howler.ctx.resume();
    }
    gameSounds.warning.play();
  }

  private startBossFight() {
    if (this.isHellWarningActive) return;
    if (this.state.loopCount > 0) {
        this.triggerHellWarning();
        return;
    }
    this.executeBossSpawn();
  }

  private executeBossSpawn() {
    if (this.currentBossLevel === 1) {
        this.hasFoughtBoss = true;
        this.state.bossTimeLeft = this.state.loopCount > 0 ? 42 : 10;
        this.bossState = 'aiming';
        this.bossShotCount = 1;
        this.stage1AttackN = 1;
        this.burstsFiredInCycle = 0;
        this.stage1CycleCount = 1;
        this.stage1LaserPhase = 0;
        this.stage1LaserTimer = 0;
    } else if (this.currentBossLevel === 2) {
        this.hasFoughtBoss2 = true;
        this.state.bossTimeLeft = 999; // Using evade counting instead
        this.bossEvadeCount = 0;
        this.bossState = 'idle';
        this.bossActionTimer = 0;
    } else if (this.currentBossLevel === 3) {
        this.hasFoughtBoss3 = true;
        this.state.bossTimeLeft = 999; // Survival mode not time based for stage 3 or 4 now? Wait, stage 3 wasn't specified to change its win condition, it was survive 20s. Let's keep it 20s.
        // Wait, the prompt for stage 3 says "Cycle 1... Cycle 2... up to N=5 or 6". Let's change time conditionally or just use survival time. I will keep time left at 25s to give it time to cycle.
        this.state.bossTimeLeft = 25; 
        this.bossState = 'aiming'; // Use aiming state for sequential firing
        this.bossActionTimer = 0;
        this.bossShotCount = 1;
        this.stage3AttackN = 1;
        this.burstsFiredInCycle = 0;
    } else if (this.currentBossLevel === 4) {
        this.hasFoughtBoss4 = true;
        this.state.bossTimeLeft = 999; // Survive all 8 attacks
        this.currentAttackPhase = 1;
        this.bossState = 'idle';
        this.bossActionTimer = 0;
    }
    this.state.isBossFight = true;
    
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
    
    // Create Boss Model
    this.bossGroup = this.createPhoenix();
    
    // Position boss in front of camera
    this.bossGroup.position.set(0, 10, -80);
    this.bossGroup.rotation.y = Math.PI; // Face the player
    this.worldObjects.add(this.bossGroup);
  }

  private createPhoenix(): THREE.Group {
    const group = new THREE.Group();
    const scale = 5;

    // Materials (Fire Gradient, flat shading, no emissive glow)
    const crimsonMat = new THREE.MeshPhongMaterial({ color: 0xc12218, flatShading: true, side: THREE.DoubleSide });
    const orangeMat = new THREE.MeshPhongMaterial({ color: 0xff8a00, flatShading: true, side: THREE.DoubleSide });
    const yellowMat = new THREE.MeshPhongMaterial({ color: 0xffd700, flatShading: true, side: THREE.DoubleSide });

    // 1. Body Unit (Icosahedron transformed)
    const bodyGeom = new THREE.IcosahedronGeometry(1.2 * scale, 0);
    bodyGeom.scale(0.8, 0.7, 2.5); // Streamlined fuselage
    const body = new THREE.Mesh(bodyGeom, crimsonMat);
    group.add(body);

    // 2. Head & Crest Unit
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.5 * scale, -2.8 * scale);

    const headGeom = new THREE.ConeGeometry(0.8 * scale, 1.6 * scale, 5);
    headGeom.rotateX(-Math.PI / 2);
    const head = new THREE.Mesh(headGeom, crimsonMat);
    headGroup.add(head);

    const beakGeom = new THREE.ConeGeometry(0.3 * scale, 1.5 * scale, 4);
    beakGeom.rotateX(-Math.PI / 2);
    beakGeom.translate(0, 0, -0.6 * scale);
    const beak = new THREE.Mesh(beakGeom, orangeMat);
    beak.position.set(0, -0.2 * scale, -0.7 * scale);
    beak.rotation.x = -0.3; // Hooked down
    headGroup.add(beak);

    // Dense Crest
    const crestObj = new THREE.Group();
    crestObj.position.set(0, 0.5 * scale, 0.2 * scale);
    
    const crestCfgs = [
        { s: 1.0, r: 0.1, z: 0.0, y: 0.0 },
        { s: 1.3, r: -0.1, z: 0.6 * scale, y: 0.1 * scale },
        { s: 1.1, r: -0.2, z: 1.2 * scale, y: 0.0 },
        { s: 0.8, r: -0.5, z: 1.7 * scale, y: -0.2 * scale },
    ];
    crestCfgs.forEach(cfg => {
        const crestFlake = new THREE.ConeGeometry(0.25 * scale, 2.0 * scale, 3);
        crestFlake.rotateX(Math.PI / 3 + cfg.r);
        const mesh = new THREE.Mesh(crestFlake, orangeMat);
        mesh.scale.set(cfg.s, cfg.s, cfg.s * 1.5);
        mesh.position.set(0, cfg.y, cfg.z);
        crestObj.add(mesh);
    });
    headGroup.add(crestObj);
    group.add(headGroup);

    // 3. Wings (5+ overlapping panels with swept-back, jagged shapes)
    const buildWing = (signX: number) => {
        const wing = new THREE.Group();
        
        // Creating organic poly panels
        const createWingPanel = (pts: THREE.Vector2[], color: THREE.Material, px: number, py: number, pz: number, rotY: number) => {
            const shape = new THREE.Shape(pts);
            const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.15 * scale, bevelEnabled: false });
            geom.rotateX(Math.PI / 2);
            const mesh = new THREE.Mesh(geom, color);
            mesh.position.set(px * signX, py, pz);
            if (signX < 0) {
                mesh.scale.x = -1; // Flip for right wing
            }
            mesh.rotation.y = rotY * signX;
            return mesh;
        };

        // Panel pts (designed for left wing, right wing gets flipped scale.x = -1)
        // Root Front: (0,0), Tip Front: (x,y), Tip Back: (x', y'), Root Back: (0, y'')
        const p1 = [new THREE.Vector2(0,0), new THREE.Vector2(2*scale, 1.0*scale), new THREE.Vector2(1.8*scale, 2.0*scale), new THREE.Vector2(0, 1.5*scale)];
        const baseMesh = createWingPanel(p1, crimsonMat, 0.8 * scale, 0, -0.5 * scale, -0.2);

        const p2 = [new THREE.Vector2(0,0), new THREE.Vector2(2.5*scale, 1.5*scale), new THREE.Vector2(2.2*scale, 2.5*scale), new THREE.Vector2(0, 1.2*scale)];
        const midMesh1 = createWingPanel(p2, orangeMat, 1.5 * scale, 0.1 * scale, -0.2 * scale, -0.1);

        const p3 = [new THREE.Vector2(0,0), new THREE.Vector2(3.0*scale, 2.0*scale), new THREE.Vector2(2.6*scale, 3.0*scale), new THREE.Vector2(0, 1.5*scale)];
        const midMesh2 = createWingPanel(p3, orangeMat, 2.5 * scale, 0.2 * scale, 0.1 * scale, 0.0);

        const p4 = [new THREE.Vector2(0,0), new THREE.Vector2(2.5*scale, 2.5*scale), new THREE.Vector2(1.8*scale, 3.5*scale), new THREE.Vector2(0, 1.0*scale)];
        const tipMesh1 = createWingPanel(p4, yellowMat, 3.8 * scale, 0.3 * scale, 0.4 * scale, 0.1);

        const p5 = [new THREE.Vector2(0,0), new THREE.Vector2(2.0*scale, 3.5*scale), new THREE.Vector2(1.0*scale, 4.0*scale), new THREE.Vector2(0, 0.8*scale)];
        const tipMesh2 = createWingPanel(p5, yellowMat, 4.8 * scale, 0.4 * scale, 0.8 * scale, 0.2);

        wing.add(baseMesh, midMesh1, midMesh2, tipMesh1, tipMesh2);
        
        // Wing dihedral angle (tilt upwards) for standard heroic V-shape silhouette
        wing.rotation.z = signX * 0.4;
        return wing;
    };

    const leftWing = buildWing(1);
    const rightWing = buildWing(-1);

    const leftPivot = new THREE.Group();
    leftPivot.position.set(0.5 * scale, 0, 0);
    leftPivot.rotation.x = THREE.MathUtils.degToRad(20); // Tilt top of wing towards player
    leftPivot.add(leftWing);

    const rightPivot = new THREE.Group();
    rightPivot.position.set(-0.5 * scale, 0, 0);
    rightPivot.rotation.x = THREE.MathUtils.degToRad(20); // Tilt top of wing towards player
    rightPivot.add(rightWing);
    
    group.add(leftPivot, rightPivot);

    // 4. Tail Feathers (At least 5 distinct flowing down and out)
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, 0, 2 * scale);

    const tailCfgs = [
        { w: 0.6*scale, l: 4.5*scale, ry: 0, rx: 0.2, col: yellowMat }, // Center longest
        { w: 0.5*scale, l: 3.8*scale, ry: 0.3, rx: 0.15, col: orangeMat }, // Inner L
        { w: 0.5*scale, l: 3.8*scale, ry: -0.3, rx: 0.15, col: orangeMat }, // Inner R
        { w: 0.4*scale, l: 3.0*scale, ry: 0.6, rx: 0.1, col: yellowMat }, // Outer L
        { w: 0.4*scale, l: 3.0*scale, ry: -0.6, rx: 0.1, col: yellowMat }, // Outer R
    ];

    tailCfgs.forEach(cfg => {
        const shape = new THREE.Shape([
            new THREE.Vector2(-cfg.w/2, 0),
            new THREE.Vector2(-cfg.w, 0.4*cfg.l), // Jagged outer step
            new THREE.Vector2(-cfg.w/2, 0.6*cfg.l),
            new THREE.Vector2(0, cfg.l), // Tip
            new THREE.Vector2(cfg.w/2, 0.8*cfg.l),
            new THREE.Vector2(cfg.w, 0.3*cfg.l), // Jagged inner step
            new THREE.Vector2(cfg.w/2, 0)
        ]);
        const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.1 * scale, bevelEnabled: false });
        geom.rotateX(Math.PI / 2);
        const mesh = new THREE.Mesh(geom, cfg.col);
        mesh.rotation.set(cfg.rx, cfg.ry, 0);
        tailGroup.add(mesh);
    });

    group.add(tailGroup);

    // Provide userData for animations
    group.userData = { radius: 3.0 * scale, leftWing: leftPivot, rightWing: rightPivot };

    // Point Light for dramatic silhouette effect without emitting natively
    const bossLight = new THREE.PointLight(0xff2200, 10, 100);
    bossLight.position.set(0, 2*scale, 0);
    group.add(bossLight);

    return group;
  }

  private updateBossFight(delta: number) {
    if (!this.bossGroup) return;

    // Wing flap animation (slow at peaks, fast in middle)
    const time = this.clock.getElapsedTime();
    const lw = this.bossGroup.userData.leftWing;
    const rw = this.bossGroup.userData.rightWing;
    if (lw && rw) {
       // Math.pow(Math.abs(sin), 0.7) creates a slightly squared-off sine wave for hovering
       let flapSpeed = 12;
       if (this.currentBossLevel === 4 && this.bossState === 'retreating') {
           flapSpeed = 24; // Faster flap during retreat
       }
       const sinT = Math.sin(time * flapSpeed);
       const flapAngle = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.7) * 0.35;
       lw.rotation.z = flapAngle;
       rw.rotation.z = -flapAngle;
    }

    this.bossActionTimer += delta;

    if (this.currentBossLevel === 1) {
        switch (this.bossState) {
          case 'aiming':
            if (this.state.loopCount > 0 && this.stage1CycleCount % 3 === 0) {
                // Laser Sequence
                this.stage1LaserTimer += delta;
                
                if (this.stage1LaserPhase === 0) {
                    this.stage1LaserPhase = 1;
                    this.stage1LaserTimer = 0;
                } else if (this.stage1LaserPhase === 1) {
                    // Stop & Aim (0.5s)
                    this.bossGroup.position.x = THREE.MathUtils.lerp(this.bossGroup.position.x, 0, delta * 5);
                    this.bossGroup.position.y = THREE.MathUtils.lerp(this.bossGroup.position.y, this.plane.position.y, delta * 5);
                    this.bossGroup.position.z = -80;
                    this.bossGroup.rotation.z = 0;
                    this.stage1LaserTargetY = this.bossGroup.position.y;
                    
                    if (this.stage1LaserTimer > 0.5) {
                        this.stage1LaserPhase = 2;
                        this.stage1LaserTimer = 0;
                        // Create warning mesh
                        const warnGeom = new THREE.BoxGeometry(1000, 0.5, 200);
                        const warnMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 });
                        this.stage1LaserWarningMesh = new THREE.Mesh(warnGeom, warnMat);
                        this.stage1LaserWarningMesh.position.set(0, this.stage1LaserTargetY, -40);
                        this.worldObjects.add(this.stage1LaserWarningMesh);
                    }
                } else if (this.stage1LaserPhase === 2) {
                    // Warning (1.0s)
                    if (this.stage1LaserTimer > 1.0) {
                        this.stage1LaserPhase = 3;
                        this.stage1LaserTimer = 0;
                        // Turn warning into laser
                        if (this.stage1LaserWarningMesh) {
                            this.worldObjects.remove(this.stage1LaserWarningMesh);
                            this.stage1LaserWarningMesh = undefined;
                        }
                        const laserGeom = new THREE.BoxGeometry(1000, 6, 200);
                        const laserMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2.0 });
                        this.stage1LaserMesh = new THREE.Mesh(laserGeom, laserMat);
                        this.stage1LaserMesh.position.set(0, this.stage1LaserTargetY, -40);
                        this.worldObjects.add(this.stage1LaserMesh);
                        
                        if (this.projectileSFX && this.projectileSFX.buffer) {
                            if (this.projectileSFX.isPlaying) this.projectileSFX.stop();
                            this.projectileSFX.play();
                        }
                    }
                } else if (this.stage1LaserPhase === 3) {
                    // Firing (0.5s)
                    // Collision check
                    if (Math.abs(this.plane.position.y - this.stage1LaserTargetY) < 3.0) {
                        this.onCrash();
                    }
                    if (this.stage1LaserTimer > 0.5) {
                        this.stage1LaserPhase = 4;
                        this.stage1LaserTimer = 0;
                        if (this.stage1LaserMesh) {
                            this.worldObjects.remove(this.stage1LaserMesh);
                            this.stage1LaserMesh = undefined;
                        }
                    }
                } else if (this.stage1LaserPhase === 4) {
                    // Cooldown (0.5s)
                    if (this.stage1LaserTimer > 0.5) {
                        this.stage1LaserPhase = 0;
                        this.stage1CycleCount++;
                        // Reset normal cycle
                        this.bossActionTimer = 0;
                        this.burstsFiredInCycle = 0;
                        this.stage1AttackN = Math.min(this.stage1AttackN + 1, 8);
                    }
                }
            } else {
                // Boss moves in a pattern in front of player
                this.bossGroup.position.x = Math.sin(time * 2) * 15;
                if (this.state.loopCount > 0) {
                    this.bossGroup.position.y = 10 + Math.sin(time * 3) * 12; // Increased travel range for Hell mode
                } else {
                    this.bossGroup.position.y = 10 + Math.sin(time * 3) * 3;
                }
                // Ensure boss stays firmly at z = -80 relative to the world
                this.bossGroup.position.z = -80;
                
                // Banking effect: tilt body based on horizontal velocity
                // velocityX = derivative of Math.sin(time * 2) * 15 = Math.cos(time * 2) * 30
                const velocityX = Math.cos(time * 2) * 30;
                this.bossGroup.rotation.z = -velocityX * 0.015;
        
                // Shoot projectiles
                if (this.state.loopCount > 0) {
                    const burstInterval = 0.2;
                    const mainCycleDelay = 2.0;
    
                    if (this.burstsFiredInCycle < this.stage1AttackN) {
                        if (this.bossActionTimer > burstInterval) {
                            const targetY = (this.burstsFiredInCycle % 2 === 0) ? this.bossGroup.position.y : this.plane.position.y;
                            this.fireBossProjectileMultiRow(this.stage1AttackN, true, targetY, 6.0);
                            this.burstsFiredInCycle++;
                            this.bossActionTimer = 0;
                        }
                    } else {
                        if (this.bossActionTimer > mainCycleDelay) {
                            this.stage1AttackN = Math.min(this.stage1AttackN + 1, 8);
                            this.burstsFiredInCycle = 0;
                            this.bossActionTimer = 0;
                            this.stage1CycleCount++;
                        }
                    }
                } else {
                    if (this.bossActionTimer > 0.8) {
                        this.bossActionTimer = 0;
                        this.fireBossProjectile();
                        this.bossShotCount++;
                    }
                }
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
    } else if (this.currentBossLevel === 2) {
        // Level 2 Boss Logic (Direct Dash Attack)
        switch (this.bossState) {
            case 'idle':
                // Hover at start position
                this.bossGroup.position.x = Math.sin(time * 2) * 8; 
                this.bossGroup.position.y = 10 + Math.sin(time * 3) * 2;
                this.bossGroup.position.z = -80;
                const vX = Math.cos(time * 2) * 16;
                this.bossGroup.rotation.z = -vX * 0.015;

                // Prepare to dash after 2 seconds
                if (this.bossActionTimer > 2.0) {
                    this.bossState = 'dashing';
                    this.bossActionTimer = 0;
                    this.bossTargetPos.set(this.plane.position.x, this.plane.position.y, 20);
                }
                break;
            case 'dashing':
                // Rapidly move toward player
                const dashSpeed = 150 * delta;
                const distToTarget = this.bossGroup.position.distanceTo(this.bossTargetPos);
                
                if (distToTarget > dashSpeed) {
                    const dir = this.bossTargetPos.clone().sub(this.bossGroup.position).normalize();
                    this.bossGroup.position.add(dir.multiplyScalar(dashSpeed));
                } else {
                    this.bossGroup.position.copy(this.bossTargetPos);
                }

                // Check collision with player
                // Using plane local world space
                if (this.bossGroup.position.z > -15 && this.bossGroup.position.z < 15) {
                    const dx = this.bossGroup.position.x - this.plane.position.x;
                    const dy = this.bossGroup.position.y - this.plane.position.y;
                    if (Math.hypot(dx, dy) < 4.5) { // Boss hit radius
                        this.onCrash();
                    }
                }

                // Passed the player -> retreat
                if (this.bossGroup.position.z >= 10) {
                    this.bossState = 'retreating';
                    this.bossActionTimer = 0;
                }
                break;
            case 'retreating':
                // Move back to starting z
                const returnSpeed = 120 * delta;
                const retTarget = new THREE.Vector3(0, 10, -80);
                const retDist = this.bossGroup.position.distanceTo(retTarget);
                
                if (retDist > returnSpeed) {
                    const dir = retTarget.clone().sub(this.bossGroup.position).normalize();
                    this.bossGroup.position.add(dir.multiplyScalar(returnSpeed));
                } else {
                    this.bossGroup.position.copy(retTarget);
                    // Cycle complete
                    this.bossEvadeCount++;
                    if (this.bossEvadeCount >= 5) {
                        this.endBossFight();
                    } else {
                        this.bossState = 'idle';
                        this.bossActionTimer = 0;
                    }
                }
                break;
            case 'exiting':
                this.bossGroup.position.y += delta * 20;
                this.bossGroup.position.z -= delta * 50;
                if (this.bossGroup.position.y > 100) {
                    this.worldObjects.remove(this.bossGroup);
                    this.bossGroup = undefined;
                }
                break;
        }
    } else if (this.currentBossLevel === 3) {
        // Level 3 Boss Logic (Vertical Orbit & NxN Burst Firing)
        switch (this.bossState) {
            case 'aiming':
                // Boss moves vertically up and down in a large range
                this.bossGroup.position.x = Math.sin(time * 1.5) * 5; 
                this.bossGroup.position.y = 15 + Math.sin(time * 2.5) * 12; // Modulated height
                this.bossGroup.position.z = -80;
                
                const velX = Math.cos(time * 1.5) * 7.5;
                this.bossGroup.rotation.z = -velX * 0.015;

                const burstInterval = 0.2;
                const mainCycleDelay = 2.0;

                if (this.burstsFiredInCycle < this.stage3AttackN) {
                    if (this.bossActionTimer > burstInterval) {
                        this.fireBossProjectileMultiRow(this.stage3AttackN);
                        this.burstsFiredInCycle++;
                        this.bossActionTimer = 0;
                    }
                } else {
                    if (this.bossActionTimer > mainCycleDelay) {
                        this.stage3AttackN = Math.min(this.stage3AttackN + 1, 6);
                        this.burstsFiredInCycle = 0;
                        this.bossActionTimer = 0;
                    }
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
    } else if (this.currentBossLevel === 4) {
        // Level 4 Boss Logic (Survival Mode)
        switch (this.bossState) {
            case 'idle':
                // Hover and wait
                this.bossGroup.position.x = Math.sin(time * 2) * 8; 
                this.bossGroup.position.y = 10 + Math.sin(time * 3) * 2;
                this.bossGroup.position.z = -80;
                this.bossGroup.rotation.z = -(Math.cos(time * 2) * 16) * 0.015;

                if (this.bossActionTimer > 2.0) { // 2 second idle between attacks
                    this.bossActionTimer = 0;
                    if (this.currentAttackPhase > 8) {
                        this.endBossFight();
                    } else {
                        // Pick next attack
                        let attackType: 'fire' | 'dash' = 'fire';
                        if (this.currentAttackPhase === 1 || this.currentAttackPhase === 3) {
                            attackType = 'fire';
                        } else if (this.currentAttackPhase === 2 || this.currentAttackPhase === 4) {
                            attackType = 'dash';
                        } else {
                            attackType = Math.random() < 0.5 ? 'fire' : 'dash';
                        }
                        
                        if (attackType === 'fire') {
                            this.fireBossProjectileGrid();
                            // Wait a bit before moving to next phase
                            this.bossState = 'aiming'; // We reuse aiming as a wait state
                        } else {
                            this.bossState = 'dashing';
                            this.bossTargetPos.set(this.plane.position.x, this.plane.position.y, 20);
                        }
                    }
                }
                break;
            case 'aiming': // Waiting after fire attack
                this.bossGroup.position.x = Math.sin(time * 2) * 8; 
                this.bossGroup.position.y = 10 + Math.sin(time * 3) * 2;
                this.bossGroup.position.z = -80;
                
                if (this.bossActionTimer > 1.5) {
                    this.currentAttackPhase++;
                    this.bossState = 'idle'; // go back to idle, which adds 2 secs delay
                    this.bossActionTimer = 0;
                }
                break;
            case 'dashing':
                const dashSpeed = 150 * delta;
                const distToTarget = this.bossGroup.position.distanceTo(this.bossTargetPos);
                
                if (distToTarget > dashSpeed) {
                    const dir = this.bossTargetPos.clone().sub(this.bossGroup.position).normalize();
                    this.bossGroup.position.add(dir.multiplyScalar(dashSpeed));
                } else {
                    this.bossGroup.position.copy(this.bossTargetPos);
                }

                if (this.bossGroup.position.z > -15 && this.bossGroup.position.z < 15) {
                    const dx = this.bossGroup.position.x - this.plane.position.x;
                    const dy = this.bossGroup.position.y - this.plane.position.y;
                    if (Math.hypot(dx, dy) < 4.5) { 
                        this.onCrash();
                    }
                }

                if (this.bossGroup.position.z >= 10) {
                    this.bossState = 'retreating';
                    this.bossActionTimer = 0;
                }
                break;
            case 'retreating':
                const retTargetPos = new THREE.Vector3(Math.sin(time * 2) * 8, 10 + Math.sin(time * 3) * 2, -80);
                this.bossGroup.position.lerp(retTargetPos, 2.5 * delta);
                
                // Tilt rotation for banking upwards/backwards
                this.bossGroup.rotation.x = THREE.MathUtils.lerp(this.bossGroup.rotation.x, -0.4, 5 * delta);

                // Use slightly larger distance for completion since destination is moving
                if (this.bossGroup.position.distanceTo(retTargetPos) < 2.0) {
                    this.bossGroup.rotation.x = 0;
                    this.bossState = 'idle';
                    this.bossActionTimer = 0;
                    this.currentAttackPhase++;
                }
                break;
            case 'exiting':
                this.bossGroup.position.y += delta * 20; 
                this.bossGroup.position.z -= delta * 50;
                if (this.bossGroup.position.y > 100) {
                    this.worldObjects.remove(this.bossGroup);
                    this.bossGroup = undefined;
                }
                break;
        }
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

  private fireBossProjectileGrid() {
    if (!this.bossGroup) return;

    if (this.projectileSFX && this.projectileSFX.buffer) {
        if (this.projectileSFX.isPlaying) this.projectileSFX.stop();
        this.projectileSFX.play();
    }

    const projSpeed = 40;
    const spacing = 4.0; // Spacing between missiles
    // Target is somewhat irrelevant because they fly straight, but let's have them fly toward the camera Z direction
    // Wait, the player is at Z=0, boss is at Z=-80.
    // They should fly along Z axis or towards player. Let's aim them directly backwards (positive Z)
    const direction = new THREE.Vector3(0, 0, 1).normalize();
    const velocity = direction.multiplyScalar(projSpeed);

    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            const projGeom = new THREE.SphereGeometry(1.5, 16, 16);
            const projMat = new THREE.MeshPhongMaterial({ color: 0xff00ff, emissive: 0xaa00aa });
            const mesh = new THREE.Mesh(projGeom, projMat);
            
            mesh.position.copy(this.bossGroup.position);
            mesh.position.x += i * spacing;
            mesh.position.y += j * spacing;
            
            this.worldObjects.add(mesh);
            this.bossProjectiles.push({ mesh, velocity });
        }
    }
  }

  private fireBossProjectileMultiRow(count: number, isHorizontal: boolean = false, targetY?: number, spacingOverride?: number) {
    if (!this.bossGroup) return;

    if (this.projectileSFX && this.projectileSFX.buffer) {
        if (this.projectileSFX.isPlaying) this.projectileSFX.stop();
        this.projectileSFX.play();
    }

    const target = this.plane.position.clone();
    const projSpeed = 40;
    const spacing = spacingOverride !== undefined ? spacingOverride : 4.0; // Spacing between missiles

    for (let i = 0; i < count; i++) {
        const projGeom = new THREE.SphereGeometry(1.5, 16, 16);
        const projMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xaa0000 });
        const mesh = new THREE.Mesh(projGeom, projMat);
        
        // Calculate offset
        const offset = (i - (count - 1) / 2) * spacing;
        
        // Spawn at boss position with offset
        mesh.position.copy(this.bossGroup.position);
        
        if (targetY !== undefined) {
            mesh.position.y = targetY;
        }

        if (isHorizontal) {
            mesh.position.x += offset;
        } else {
            mesh.position.y += offset;
        }
        
        this.worldObjects.add(mesh);

        // Aim each missile directly at the player's 2D plane position (x, y) but from its respective spawn Y
        // To fly parallel, use the same base direction for all. To converge, aim them all at target.
        // Let's have them fly parallel so they stay in rows.
        const baseDirection = new THREE.Vector3().subVectors(target, this.bossGroup.position).normalize();
        const velocity = baseDirection.multiplyScalar(projSpeed);

        this.bossProjectiles.push({ mesh, velocity });
    }
  }

  private endBossFight() {
    this.state.isBossFight = false;
    this.bossState = 'exiting';
    if (this.stage1LaserWarningMesh) {
        this.worldObjects.remove(this.stage1LaserWarningMesh);
        this.stage1LaserWarningMesh = undefined;
    }
    if (this.stage1LaserMesh) {
        this.worldObjects.remove(this.stage1LaserMesh);
        this.stage1LaserMesh = undefined;
    }
    if (this.currentBossLevel === 1) {
        this.state.stage = 'Ocean';
        this.state.timeLeft += 5; // Bonus
    } else if (this.currentBossLevel === 2) {
        this.state.stage = 'City';
        this.state.timeLeft += 10; 
    } else if (this.currentBossLevel === 3) {
        this.state.stage = 'Space';
        this.state.timeLeft += 15; 
    } else if (this.currentBossLevel === 4) {
        this.state.stage = 'Meadow';
        this.state.timeLeft += 20; 
        this.state.loopCount++;
        // Reset survival time to cleanly trigger bosses again
        this.state.survivedTime = 0;
        this.hasFoughtBoss = false;
        this.hasFoughtBoss2 = false;
        this.hasFoughtBoss3 = false;
        this.hasFoughtBoss4 = false;
        
        // Remove all stage 4 projectiles from scene
        for (const proj of this.bossProjectiles) {
            this.worldObjects.remove(proj.mesh);
        }
        this.bossProjectiles = [];
    }
    this.envManager.setStage(this.state.stage);
    
    this.onStateUpdate(this.state);

    if (this.bossBGM && this.bossBGM.isPlaying) {
        this.bossBGM.stop();
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

  private onKeyDown(e: KeyboardEvent) {
    if (['1', '2', '3', '4', '5'].includes(e.key)) {
        if (this.lastDebugKey && this.lastDebugKey !== e.key) {
            this.debugKeyCounters[this.lastDebugKey] = 0;
        }
        this.lastDebugKey = e.key;
        this.debugKeyCounters[e.key] = (this.debugKeyCounters[e.key] || 0) + 1;

        if (this.debugKeyCounters[e.key] >= 5) {
            this.debugKeyCounters[e.key] = 0;
            if (e.key === '5') {
                let nextLevel = this.currentBossLevel;
                if (this.state.isBossFight) {
                    nextLevel = this.currentBossLevel + 1;
                    if (nextLevel > 4) {
                        nextLevel = 1;
                        this.state.loopCount++;
                    }
                }
                this.warpToBoss(nextLevel);
            } else {
                this.warpToBoss(parseInt(e.key));
            }
        }
    } else {
        this.debugKeyCounters = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
        this.lastDebugKey = '';
    }
  }

  private warpToBoss(level: number) {
    console.log(`Debug: Warping to Boss ${level}`);
    if (this.state.isGameOver) {
        return;
    }
    if (!this.gameActive) {
        this.start();
    }

    // Clear Screen (items and enemies)
    for (const coin of this.coins) {
        this.worldObjects.remove(coin);
    }
    this.coins = [];

    for (const obs of this.obstacles) {
        this.worldObjects.remove(obs);
    }
    this.obstacles = [];

    if (this.bossGroup) {
        this.worldObjects.remove(this.bossGroup);
        this.bossGroup = undefined;
    }
    if (this.bossProjectiles) {
        for (const p of this.bossProjectiles) {
            this.worldObjects.remove(p.mesh);
        }
        this.bossProjectiles = [];
    }

    // Update Stage State & Progress Bar Sync
    this.state.isBossFight = false;
    this.hasFoughtBoss = false;
    this.hasFoughtBoss2 = false;
    this.hasFoughtBoss3 = false;
    this.hasFoughtBoss4 = false;
    this.state.stageProgress = 1;

    if (level === 1) {
        this.state.stage = 'Meadow';
        this.state.survivedTime = 30;
    } else if (level === 2) {
        this.state.stage = 'Ocean';
        this.hasFoughtBoss = true;
        this.state.survivedTime = 55;
    } else if (level === 3) {
        this.state.stage = 'City';
        this.hasFoughtBoss = true;
        this.hasFoughtBoss2 = true;
        this.state.survivedTime = 85;
    } else if (level === 4) {
        this.state.stage = 'Space';
        this.hasFoughtBoss = true;
        this.hasFoughtBoss2 = true;
        this.hasFoughtBoss3 = true;
        this.state.survivedTime = 110;
    }
    
    this.envManager.setStage(this.state.stage);

    // Spawn Function
    this.currentBossLevel = level;
    this.startBossFight();

    // Reset Player
    this.state.timeLeft = Math.max(this.state.timeLeft, 30);
    this.onStateUpdate(this.state);
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
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      Howler.ctx.resume();
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
    this.hasFoughtBoss2 = false;
    this.hasFoughtBoss3 = false;
    this.hasFoughtBoss4 = false;
    this.currentBossLevel = 1;
    this.bossEvadeCount = 0;
    this.bossShotCount = 1;
    this.stage3AttackN = 1;
    this.burstsFiredInCycle = 0;
    this.stage1CycleCount = 1;
    this.stage1LaserPhase = 0;
    this.stage1LaserTimer = 0;
    if (this.stage1LaserWarningMesh) {
        this.worldObjects.remove(this.stage1LaserWarningMesh);
        this.stage1LaserWarningMesh = undefined;
    }
    if (this.stage1LaserMesh) {
        this.worldObjects.remove(this.stage1LaserMesh);
        this.stage1LaserMesh = undefined;
    }
    this.currentAttackPhase = 1;
    
    if (this.bossBGM && this.bossBGM.isPlaying) {
        this.bossBGM.stop();
    }

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

    if (this.isHellWarningActive) {
        this.hellWarningTimer += delta;
        this.cameraShakeIntensity = 2.0;

        if (this.hellWarningTimer >= 2.0) {
            this.isHellWarningActive = false;
            this.state.isHellWarning = false;
            this.onStateUpdate({ ...this.state });
            this.cameraShakeIntensity = 0;
            
            gameSounds.warning.fade(0.5, 0, 500);
            setTimeout(() => { gameSounds.warning.stop(); }, 500);
            gameSounds.bossEntry.play();
            
            this.executeBossSpawn();
        }
        // Environment keeps moving, but we skip boss timers, etc.
    }

    if (!this.state.isBossFight && !this.isHellWarningActive) {
      // Normal Timer
      this.state.timeLeft -= delta;
      this.state.survivedTime += delta;
    } else if (this.state.isBossFight && !this.isHellWarningActive) {
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
    if (!this.state.isBossFight) {
        if (this.state.stage === 'Meadow') {
            this.state.stageProgress = Math.min(1, this.state.survivedTime / 30);
            if (this.state.survivedTime >= 30 && !this.hasFoughtBoss) {
                this.currentBossLevel = 1;
                this.startBossFight();
            }
        } else if (this.state.stage === 'Ocean') {
            this.state.stageProgress = Math.min(1, Math.max(0, this.state.survivedTime - 30) / 25);
            if (this.state.survivedTime >= 55 && !this.hasFoughtBoss2) {
                this.currentBossLevel = 2;
                this.startBossFight();
            }
        } else if (this.state.stage === 'City') {
            this.state.stageProgress = Math.min(1, Math.max(0, this.state.survivedTime - 55) / 30);
            if (this.state.survivedTime >= 85 && !this.hasFoughtBoss3) {
                this.currentBossLevel = 3;
                this.startBossFight();
            }
        } else if (this.state.stage === 'Space') {
            this.state.stageProgress = Math.min(1, Math.max(0, this.state.survivedTime - 85) / 25);
            if (this.state.survivedTime >= 110 && !this.hasFoughtBoss4) {
                this.currentBossLevel = 4;
                this.startBossFight();
            }
        } else {
            this.state.stageProgress = 1;
        }
    } else {
        this.state.stageProgress = 1;
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
