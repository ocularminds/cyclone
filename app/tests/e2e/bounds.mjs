// Read mounted geometry in the active immersive session; no layout/pose mutation.
export function reviewBounds(d, rootName, panelName) {
  const found = d.cli(['ecs', 'find'], { namePattern: panelName, limit: 10 }).entities;
  const entity = found.find(e => e.name === panelName) ?? found[0];
  const ui = d.cli(['ui', 'inspect'], { entityIndex: entity.entityIndex, properties: ['fontFamily', 'fontWeight', 'fontSize', 'color', 'backgroundColor', 'backgroundOpacity'] });
  const measured = d.page(`(()=>{
    const c=window.cyclone,root=c.stage.root.getObjectByName(${JSON.stringify(rootName)}),panel=c.stage.root.getObjectByName(${JSON.stringify(panelName)}),V=root.position.constructor;
    c.stage.root.updateWorldMatrix(true,true);
    const head=c.stage.head.clone().applyMatrix4(c.stage.root.matrixWorld),forward=c.stage.gaze.clone().transformDirection(c.stage.root.matrixWorld);
    const right=new V().crossVectors(forward,new V(0,1,0)).normalize(),up=new V().crossVectors(right,forward).normalize();
    const result=[];
    const measure=(name,points,extra={})=>{const rel=points.map(p=>p.sub(head));result.push({name,reach:Math.max(...rel.map(v=>v.length())),horizontal:Math.max(...rel.map(v=>Math.abs(Math.atan2(v.dot(right),v.dot(forward))*180/Math.PI))),vertical:Math.max(...rel.map(v=>Math.abs(Math.atan2(v.dot(up),v.dot(forward))*180/Math.PI))),...extra})};
    root.traverse(o=>{if(!o.userData.label&&!['card-caption','receipt-caption'].includes(o.name))return;const a=o.geometry.attributes.position;const points=[];for(let i=0;i<a.count;i++)points.push(new V().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld));const at=root.worldToLocal(o.getWorldPosition(new V()));measure(o.name,points,{visible:o.visible,label:o.userData.label,rect:{x:at.x,y:at.y,width:o.geometry.parameters.width,height:o.geometry.parameters.height}})});
    const q=panel.getWorldQuaternion(panel.quaternion.clone());
    for(const row of ${JSON.stringify(ui.elements)}){
      if(!row.state.displayed||!row.state.visible||!['a','b','c'].includes(row.id))continue;
      const e=panel.requireElementById(row.id),center=e.getWorldPosition(new V()),w=row.layout.size[0]/100,h=row.layout.size[1]/100;
      const points=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>new V(x*w/2,y*h/2,0).applyQuaternion(q).add(center));const at=root.worldToLocal(center.clone());measure(row.id,points,{width:w,height:h,rect:{x:at.x,y:at.y,width:w,height:h}});
    }
    return {root:root.name,visible:root.visible,head:head.toArray(),gaze:forward.toArray(),position:root.position.toArray(),page:root.userData.page,pagination:root.userData.pagination,measured:result};
  })()`);
  return { ui, ...measured };
}
