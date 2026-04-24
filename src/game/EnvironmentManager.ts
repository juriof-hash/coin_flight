import * as THREE from 'three';

interface InstanceItem {
    type: string;
    id: number;
    x: number;
    y: number;
    z: number;
    scale: number;
    sx?: number; sy?: number; sz?: number; 
    rotX?: number; rotY?: number; rotSpeedX?: number; rotSpeedY?: number; 
    color?: number;
    isActive: boolean;
}

interface ActiveStage {
    name: string;
    meshes: THREE.InstancedMesh[];
    instanceData: { meshRef: THREE.InstancedMesh[], data: InstanceItem[] }[];
}

export class EnvironmentManager {
  private scene: THREE.Scene;
  private currentStageName: string = '';
  private previousStageName: string = '';
  private transitionProgress: number = 1.0;
  
  private environmentGroup: THREE.Group;
  private activeStages: Map<string, ActiveStage> = new Map();

  // Floor
  private floor: THREE.Mesh;
  private floorMat: THREE.MeshPhongMaterial;
  private waveAmplitude: number = 0;

  // Stars
  private stars?: THREE.Points;
  private starMaterial?: THREE.PointsMaterial;

  private stageFloorProps: Record<string, any> = {
      'Meadow': { color: new THREE.Color(0x2d8a4e), opacity: 1.0, shininess: 0, y: -10, waveAmp: 0.8 },
      'Ocean': { color: new THREE.Color(0x1ca3ec), opacity: 0.8, shininess: 80, y: -10, waveAmp: 1.5 },
      'City': { color: new THREE.Color(0x111111), opacity: 1.0, shininess: 30, y: -10, waveAmp: 0.0 },
      'Space': { color: new THREE.Color(0x000000), opacity: 0.0, shininess: 0, y: -100, waveAmp: 0.0 } // floor vanishes
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.environmentGroup = new THREE.Group();
    this.scene.add(this.environmentGroup);
    
    // Init single global floor
    const floorGeom = new THREE.PlaneGeometry(1000, 1000, 32, 32);
    this.floorMat = new THREE.MeshPhongMaterial({ 
        color: 0x2d8a4e, 
        flatShading: true,
        transparent: true,
        opacity: 1.0,
        shininess: 0
    });
    this.floor = new THREE.Mesh(floorGeom, this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -10;
    this.floor.receiveShadow = true;
    this.environmentGroup.add(this.floor);

    this.createStars();
  }

  private createStars() {
    const starGeom = new THREE.BufferGeometry();
    const starCount = 2000;
    const posArray = new Float32Array(starCount * 3);
    for(let i=0; i < starCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 800; // wide spread
        if (i%3 === 1) posArray[i] += 100; // bias y upwards
        if (i%3 === 2) posArray[i] -= 200; // bias z backwards
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    this.starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0.0 });
    this.stars = new THREE.Points(starGeom, this.starMaterial);
    this.environmentGroup.add(this.stars);
  }

  public setStage(stage: string, immediate: boolean = false) {
    if (this.currentStageName === stage) return;
    
    // Initial setup
    const isInitial = (this.currentStageName === '');

    if (!this.activeStages.has(stage)) {
       this.setupStageData(stage, isInitial);
    }
    
    if (!isInitial) {
       this.previousStageName = this.currentStageName;
    }
    this.currentStageName = stage;

    if (immediate || isInitial) {
       this.transitionProgress = 1.0;
       // force delete old if immediate
       if (immediate && this.previousStageName !== '') {
           this.disposeStage(this.previousStageName);
           this.previousStageName = '';
       }
    } else {
       this.transitionProgress = 0.0;
    }
  }

  private disposeStage(stageName: string) {
      const stage = this.activeStages.get(stageName);
      if (!stage) return;
      
      stage.meshes.forEach(mesh => {
         mesh.geometry.dispose();
         if (Array.isArray(mesh.material)) {
             mesh.material.forEach(m => m.dispose());
         } else {
             mesh.material.dispose();
         }
         this.environmentGroup.remove(mesh);
      });
      this.activeStages.delete(stageName);
  }

  private setupStageData(stage: string, isInitial: boolean) {
     const stageData: ActiveStage = {
         name: stage,
         meshes: [],
         instanceData: []
     };

     if (stage === 'Meadow') this.populateMeadow(stageData, isInitial);
     else if (stage === 'Ocean') this.populateOcean(stageData, isInitial);
     else if (stage === 'City') this.populateCity(stageData, isInitial);
     else if (stage === 'Space') this.populateSpace(stageData, isInitial);

     this.activeStages.set(stage, stageData);
  }

  private randomZ(isInitial: boolean) {
      // If initial, spread out over visible range. If not, start far away so they flow in.
      return isInitial ? (-Math.random() * 300) : (-Math.random() * 50 - 300);
  }

  private populateMeadow(stage: ActiveStage, isInitial: boolean) {
    const treeCount = 150;
    const trunkGeom = new THREE.CylinderGeometry(0.3, 0.5, 1.5, 5);
    const leavesGeom = new THREE.DodecahedronGeometry(2, 0);
    const trunkMat = new THREE.MeshPhongMaterial({ color: 0x5a4325, flatShading: true });
    const leavesMat = new THREE.MeshPhongMaterial({ color: 0x3a9e5b, flatShading: true });
    
    const treeTrunks = new THREE.InstancedMesh(trunkGeom, trunkMat, treeCount);
    const treeLeaves = new THREE.InstancedMesh(leavesGeom, leavesMat, treeCount);
    treeTrunks.castShadow = true;
    treeLeaves.castShadow = true;
    
    const treeData: InstanceItem[] = [];
    for (let i = 0; i < treeCount; i++) {
        const x = (Math.random() - 0.5) * 150;
        const z = this.randomZ(isInitial);
        const scale = 0.6 + Math.random() * 0.8;
        treeData.push({ type: 'tree', id: i, x, y: -10, z, scale, isActive: isInitial });
    }
    
    this.environmentGroup.add(treeTrunks, treeLeaves);
    stage.meshes.push(treeTrunks, treeLeaves);
    stage.instanceData.push({ meshRef: [treeTrunks, treeLeaves], data: treeData });
  }

  private populateOcean(stage: ActiveStage, isInitial: boolean) {
    const rockCount = 50;
    const rockGeom = new THREE.DodecahedronGeometry(3, 1);
    const rockMat = new THREE.MeshPhongMaterial({ color: 0x888888, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeom, rockMat, rockCount);
    rocks.castShadow = true;

    const rockData: InstanceItem[] = [];
    for (let i = 0; i < rockCount; i++) {
        const x = (Math.random() - 0.5) * 200;
        const z = this.randomZ(isInitial);
        const scale = 0.5 + Math.random() * 1.5;
        rockData.push({ type: 'rock', id: i, x, y: -10.5, z, scale, isActive: isInitial });
    }

    this.environmentGroup.add(rocks);
    stage.meshes.push(rocks);
    stage.instanceData.push({ meshRef: [rocks], data: rockData });
  }

  private populateCity(stage: ActiveStage, isInitial: boolean) {
    const bldgCount = 200;
    const bldgGeom = new THREE.BoxGeometry(4, 1, 4);
    bldgGeom.translate(0, 0.5, 0);
    const bldgMat = new THREE.MeshPhongMaterial({ color: 0x222233, flatShading: true });
    
    const neonCount = 100;
    const neonGeom = new THREE.BoxGeometry(4.2, 0.2, 4.2);
    const neonMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // Use colors per instance

    const buildings = new THREE.InstancedMesh(bldgGeom, bldgMat, bldgCount);
    const neons = new THREE.InstancedMesh(neonGeom, neonMat, neonCount);
    buildings.castShadow = true;

    const bldgData: InstanceItem[] = [];
    const neonData: InstanceItem[] = [];

    for (let i = 0; i < bldgCount; i++) {
        let x = (Math.random() - 0.5) * 200;
        if (Math.abs(x) < 20) x += Math.sign(x) * 20;

        const z = this.randomZ(isInitial);
        const width = 1 + Math.random() * 2;
        const depth = 1 + Math.random() * 2;
        const height = 5 + Math.random() * 25;
        
        bldgData.push({ type: 'building', id: i, x, y: -10, z, scale: 1, sx: width, sy: height, sz: depth, isActive: isInitial });

        if (i < neonCount) {
             const neonColor = Math.random() > 0.5 ? 0x00ffcc : 0xff00ff;
             neonData.push({ type: 'neon', id: i, x, y: -10 + height * (0.3 + Math.random()*0.6), z, scale: 1, sx: width, sz: depth, color: neonColor, isActive: isInitial });
        }
    }

    // Set Colors
    const neonColorObj = new THREE.Color();
    for (let i=0; i<neonCount; i++) {
        neonColorObj.setHex(neonData[i].color!);
        neons.setColorAt(i, neonColorObj);
    }
    neons.instanceColor!.needsUpdate = true;

    this.environmentGroup.add(buildings, neons);
    stage.meshes.push(buildings, neons);
    stage.instanceData.push({ meshRef: [buildings], data: bldgData });
    stage.instanceData.push({ meshRef: [neons], data: neonData });
  }

  private populateSpace(stage: ActiveStage, isInitial: boolean) {
    const astCount = 250;
    const astGeom = new THREE.DodecahedronGeometry(2, 0);
    const astMat = new THREE.MeshPhongMaterial({ color: 0x444444, flatShading: true });
    
    const asteroids = new THREE.InstancedMesh(astGeom, astMat, astCount);
    asteroids.castShadow = true;

    const astData: InstanceItem[] = [];
    for (let i = 0; i < astCount; i++) {
        const x = (Math.random() - 0.5) * 200;
        const y = (Math.random() - 0.5) * 150 - 20; 
        const z = this.randomZ(isInitial);
        const scale = 0.5 + Math.random() * 3;
        
        const rotX = Math.random() * Math.PI;
        const rotY = Math.random() * Math.PI;

        astData.push({ type: 'asteroid', id: i, x, y, z, scale, rotX, rotY, rotSpeedX: (Math.random()-0.5)*0.02, rotSpeedY: (Math.random()-0.5)*0.02, isActive: isInitial });
    }

    this.environmentGroup.add(asteroids);
    stage.meshes.push(asteroids);
    stage.instanceData.push({ meshRef: [asteroids], data: astData });
  }

  public update(moveSpeed: number, delta: number) {
    // Progress Transition
    if (this.transitionProgress < 1.0) {
       this.transitionProgress += delta / 8.0; // 8 sec transition
       if (this.transitionProgress > 1.0) {
           this.transitionProgress = 1.0;
           if (this.previousStageName !== '') {
               this.disposeStage(this.previousStageName);
               this.previousStageName = '';
           }
       }
    }

    if (this.currentStageName !== '') {
        this.updateFloorAndStars(delta);
    }

    const dummy = new THREE.Object3D();

    for (const [stageName, stage] of this.activeStages.entries()) {
        const isCurrent = (stageName === this.currentStageName);
        const isPrevious = (stageName === this.previousStageName);
        
        let spawnProb = 0.0;
        if (isCurrent && this.transitionProgress >= 1.0) spawnProb = 1.0;
        else if (isCurrent) spawnProb = this.transitionProgress;
        else if (isPrevious) spawnProb = 1.0 - this.transitionProgress;
        else spawnProb = 0.0; 

        for (const group of stage.instanceData) {
            for (let i = 0; i < group.data.length; i++) {
                const item = group.data[i];
                // Always move regardless of active state so they can recycle
                item.z += moveSpeed;

                if (item.z > 40) {
                    item.z = -300 - Math.random() * 50; 
                    if (item.type === 'building' || item.type === 'neon') {
                        item.x = (Math.random() - 0.5) * 200;
                        if (Math.abs(item.x) < 20) item.x += Math.sign(item.x) * 20;
                    } else if (item.type === 'asteroid') {
                        item.x = (Math.random() - 0.5) * 200;
                        item.y = (Math.random() - 0.5) * 150 - 20;
                    } else {
                         item.x = (Math.random() - 0.5) * 150;
                    }

                    // Weighted object respawn
                    item.isActive = (Math.random() < spawnProb);
                }

                // Space transition sinking
                if (this.currentStageName === 'Space' && isPrevious) {
                    item.y -= delta * 15.0; // Sink down
                }

                // Apply transforms
                const visibleScale = item.isActive ? 1.0 : 0.0;
                
                if (item.type === 'tree') {
                    dummy.position.set(item.x, item.y + 0.75 * item.scale, item.z);
                    dummy.scale.set(item.scale * visibleScale, item.scale * visibleScale, item.scale * visibleScale);
                    dummy.rotation.set(0, 0, 0);
                    dummy.updateMatrix();
                    group.meshRef[0].setMatrixAt(item.id, dummy.matrix);
                    
                    dummy.position.set(item.x, item.y + 2.5 * item.scale, item.z);
                    dummy.updateMatrix();
                    group.meshRef[1].setMatrixAt(item.id, dummy.matrix);

                } else if (item.type === 'rock') {
                    dummy.position.set(item.x, item.y, item.z);
                    dummy.scale.set(item.scale * visibleScale, item.scale * 0.5 * visibleScale, item.scale * visibleScale);
                    dummy.updateMatrix();
                    group.meshRef[0].setMatrixAt(item.id, dummy.matrix);

                } else if (item.type === 'building') {
                    dummy.position.set(item.x, item.y, item.z);
                    dummy.scale.set(item.sx! * visibleScale, item.sy! * visibleScale, item.sz! * visibleScale);
                    dummy.updateMatrix();
                    group.meshRef[0].setMatrixAt(item.id, dummy.matrix);

                } else if (item.type === 'neon') {
                    dummy.position.set(item.x, item.y, item.z);
                    dummy.scale.set(item.sx! * visibleScale, 1 * visibleScale, item.sz! * visibleScale);
                    dummy.updateMatrix();
                    group.meshRef[0].setMatrixAt(item.id, dummy.matrix);

                } else if (item.type === 'asteroid') {
                    item.rotX! += item.rotSpeedX!;
                    item.rotY! += item.rotSpeedY!;
                    dummy.position.set(item.x, item.y, item.z);
                    dummy.scale.set(item.scale * visibleScale, item.scale * visibleScale, item.scale * visibleScale);
                    dummy.rotation.set(item.rotX!, item.rotY!, 0);
                    dummy.updateMatrix();
                    group.meshRef[0].setMatrixAt(item.id, dummy.matrix);
                }
            }
            
            group.meshRef.forEach((mesh: THREE.InstancedMesh) => {
                 mesh.instanceMatrix.needsUpdate = true;
            });
        }
    }
  }

  private updateFloorAndStars(delta: number) {
     const target = this.stageFloorProps[this.currentStageName];
     
     this.floorMat.color.lerp(target.color, delta * 0.5);
     this.floorMat.opacity += (target.opacity - this.floorMat.opacity) * delta * 0.5;
     this.floorMat.shininess += (target.shininess - this.floorMat.shininess) * delta * 0.5;
     this.floor.position.y += (target.y - this.floor.position.y) * delta * 0.5;
     
     this.waveAmplitude += (target.waveAmp - this.waveAmplitude) * delta * 0.5;

     if (this.waveAmplitude > 0.05) {
         const time = performance.now() * 0.002;
         const positions = this.floor.geometry.attributes.position;
         for(let i=0; i<positions.count; i++) {
             const x = positions.getX(i);
             const y = positions.getY(i);
             const wave = (Math.sin(x * 0.05 + time) * 0.5 + Math.cos(y * 0.05 + time * 0.8) * 0.5) * this.waveAmplitude;
             positions.setZ(i, wave);
         }
         positions.needsUpdate = true;
     } else {
         const positions = this.floor.geometry.attributes.position;
         for(let i=0; i<positions.count; i++) {
             positions.setZ(i, 0); // flatten smoothly would be better, but instant flat is okay when approaching 0
         }
         positions.needsUpdate = true;
     }

     // Stars Logic
     if (this.starMaterial) {
         const targetStarOpacity = (this.currentStageName === 'Space') ? 0.8 : 0.0;
         this.starMaterial.opacity += (targetStarOpacity - this.starMaterial.opacity) * delta * 0.5;
     }
  }

  public dispose() {
    for (const name of Array.from(this.activeStages.keys())) {
        this.disposeStage(name);
    }
    this.floor.geometry.dispose();
    this.floorMat.dispose();
  }
}
