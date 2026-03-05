import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

export async function loadModels() {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
  ]);
}

export async function getFaceEmbedding(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
  const detection = await faceapi.detectSingleFace(input)
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  return detection ? detection.descriptor : null;
}

export function createFaceMatcher(users: { name: string, embedding: number[] }[]) {
  const labeledDescriptors = users.map(user => {
    return new faceapi.LabeledFaceDescriptors(
      user.name,
      [new Float32Array(user.embedding)]
    );
  });
  
  return new faceapi.FaceMatcher(labeledDescriptors, 0.6);
}
