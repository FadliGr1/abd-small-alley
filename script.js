document.addEventListener('DOMContentLoaded', () => {
    const regularKmzFileInput = document.getElementById('regularKmzFile');
    const smallAlleyKmzFileInput = document.getElementById('smallAlleyKmzFile');
    const idAreaInput = document.getElementById('idArea');
    const processBtn = document.getElementById('processBtn');
    const messageDiv = document.getElementById('message');
    const downloadLink = document.getElementById('downloadLink');
    const downloadMessageDiv = document.getElementById('downloadMessage');
    const regularFileNameSpan = document.getElementById('regularFileName');
    const smallAlleyFileNameSpan = document.getElementById('smallAlleyFileName');
    const processingOverlay = document.getElementById('processingOverlay');
    const loadingMessage = document.getElementById('loadingMessage');
    const progressBar = document.getElementById('progressBar');

    let regularKmzFile = null;
    let smallAlleyKmzFile = null;
    let processedKmzBlob = null;

    regularKmzFileInput.addEventListener('change', (event) => {
        regularKmzFile = event.target.files[0];
        regularFileNameSpan.textContent = regularKmzFile ? regularKmzFile.name : 'Tidak ada file dipilih';
        showMessage(`File KMZ ABD Reguler: ${regularKmzFile ? regularKmzFile.name : 'Belum diunggah'}`, 'info');
    });

    smallAlleyKmzFileInput.addEventListener('change', (event) => {
        smallAlleyKmzFile = event.target.files[0];
        smallAlleyFileNameSpan.textContent = smallAlleyKmzFile ? smallAlleyKmzFile.name : 'Tidak ada file dipilih';
        showMessage(`File Bahan Small Alley: ${smallAlleyKmzFile ? smallAlleyKmzFile.name : 'Belum diunggah'}`, 'info');
    });

    processBtn.addEventListener('click', processKmzFiles);

    function showMessage(msg, type = 'info') {
        messageDiv.textContent = msg;
        messageDiv.className = `message ${type}`;
    }

    function showDownloadMessage(msg, isReady = false) {
        downloadMessageDiv.innerHTML = `<p>${msg}</p>`;
        if (isReady) {
            downloadLink.style.display = 'block';
            downloadMessageDiv.classList.add('ready');
        } else {
            downloadLink.style.display = 'none';
            downloadMessageDiv.classList.remove('ready');
        }
    }

    function showProcessingOverlay(show, msg = '', progress = 0) {
        processingOverlay.style.display = show ? 'flex' : 'none';
        if (show) {
            loadingMessage.textContent = msg;
            progressBar.style.width = `${progress}%`;
            processBtn.disabled = true; // Disable button during processing
        } else {
            processBtn.disabled = false; // Enable button after processing
            loadingMessage.textContent = '';
            progressBar.style.width = '0%';
        }
    }

    function updateProgressBar(progress, msg) {
        progressBar.style.width = `${progress}%`;
        loadingMessage.textContent = msg;
    }

    async function processKmzFiles() {
        showMessage('Memulai pemrosesan...', 'info');
        downloadLink.style.display = 'none';
        downloadLink.href = '#';
        showDownloadMessage('Sedang memproses file. Mohon tunggu...', false);
        processedKmzBlob = null;

        if (!regularKmzFile || !smallAlleyKmzFile) {
            showMessage('Harap unggah kedua file KMZ terlebih dahulu.', 'error');
            showDownloadMessage('Silakan proses file KMZ terlebih dahulu.', false);
            return;
        }

        const idArea = idAreaInput.value.trim();
        if (!idArea) {
            showMessage('Harap masukkan ID Area.', 'error');
            showDownloadMessage('Silakan proses file KMZ terlebih dahulu.', false);
            return;
        }

        showProcessingOverlay(true, 'Mengekstrak file KMZ...', 10);

        try {
            const regularKmzData = await regularKmzFile.arrayBuffer();
            const smallAlleyKmzData = await smallAlleyKmzFile.arrayBuffer();
            updateProgressBar(20, 'Mengekstrak KML dari KMZ...');

            const regularKml = await extractKmlFromKmz(regularKmzData);
            const smallAlleyKml = await extractKmlFromKmz(smallAlleyKmzData);

            if (!regularKml || !smallAlleyKml) {
                throw new Error("Gagal mengekstrak KML dari salah satu KMZ. Pastikan file KMZ valid dan mengandung KML.");
            }
            updateProgressBar(40, 'Memparsing data KML...');

            const processedKml = processKml(regularKml, smallAlleyKml, idArea, (progress, msg) => {
                // Adjust progress range for this step (40% to 80%)
                updateProgressBar(40 + (progress * 0.4), msg);
            });
            updateProgressBar(80, 'Membuat KMZ baru...');

            const newKmzBlob = await createKmzFromKml(processedKml, idArea);

            processedKmzBlob = newKmzBlob;
            const url = URL.createObjectURL(processedKmzBlob);
            downloadLink.href = url;
            downloadLink.download = `${idArea}_Processed.kmz`;
            showProcessingOverlay(false);
            showDownloadMessage('File KMZ berhasil diproses dan siap diunduh!', true);
            showMessage('Pemrosesan selesai. File siap diunduh.', 'success');

        } catch (error) {
            console.error('Error during KMZ processing:', error);
            showProcessingOverlay(false);
            showMessage(`Terjadi kesalahan: ${error.message}. Pastikan format KMZ benar dan ID Area sudah dimasukkan.`, 'error');
            showDownloadMessage('Terjadi kesalahan saat memproses file.', false);
        }
    }

    async function extractKmlFromKmz(kmzBuffer) {
        const zip = await JSZip.loadAsync(kmzBuffer);
        const kmlFile = Object.keys(zip.files).find(fileName => fileName.endsWith('.kml'));

        if (kmlFile) {
            return zip.file(kmlFile).async('text');
        } else {
            throw new Error("Tidak ada file KML ditemukan di dalam KMZ.");
        }
    }

    async function createKmzFromKml(kmlString, idArea) {
        const zip = new JSZip();
        zip.file(`${idArea}_Processed.kml`, kmlString); // Save KML with ID Area in filename
        const content = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
        return content;
    }

    function parseKml(kmlString) {
        const parser = new DOMParser();
        return parser.parseFromString(kmlString, "text/xml");
    }

    // Function to get placemarks (slightly modified for progress reporting in the future if needed)
    function getPlacemarks(kmlDoc, folderPaths) {
        const placemarks = [];
        folderPaths.forEach(folderPath => {
            const pathParts = folderPath.split('/');
            let currentNodes = [kmlDoc];

            for (let i = 0; i < pathParts.length; i++) {
                const part = pathParts[i];
                const nextNodes = [];
                currentNodes.forEach(node => {
                    const folders = node.querySelectorAll('Folder > name');
                    folders.forEach(folderNameNode => {
                        if (folderNameNode.textContent.trim() === part) {
                            nextNodes.push(folderNameNode.parentNode);
                        }
                    });
                });
                currentNodes = nextNodes;
                if (currentNodes.length === 0 && i < pathParts.length - 1) return; // Path not found
            }

            currentNodes.forEach(folderNode => {
                const pmElements = folderNode.querySelectorAll('Placemark');
                pmElements.forEach(pm => {
                    const name = pm.querySelector('name')?.textContent.trim() || '';
                    const coordinatesStr = pm.querySelector('Point coordinates')?.textContent.trim() ||
                                         pm.querySelector('LineString coordinates')?.textContent.trim() || '';

                    let coordinates = [];
                    if (coordinatesStr) {
                        coordinates = coordinatesStr.split(' ').map(coordPair => {
                            const [lon, lat, alt] = coordPair.split(',').map(Number);
                            return { lon, lat, alt };
                        }).filter(c => !isNaN(c.lon) && !isNaN(c.lat));
                    }

                    const extendedData = {};
                    pm.querySelectorAll('ExtendedData SimpleData').forEach(sd => {
                        const name = sd.getAttribute('name');
                        const value = sd.textContent.trim();
                        if (name) extendedData[name] = value;
                    });

                    placemarks.push({
                        name,
                        coordinates,
                        extendedData,
                        originalElement: pm.cloneNode(true) // Keep a copy of the original element
                    });
                });
            });
        });
        return placemarks;
    }

    // Function to get polygons (slightly modified for progress reporting in the future if needed)
    function getPolygons(kmlDoc, folderPaths) {
        const polygons = [];
        folderPaths.forEach(folderPath => {
            const pathParts = folderPath.split('/');
            let currentNodes = [kmlDoc];

            for (let i = 0; i < pathParts.length; i++) {
                const part = pathParts[i];
                const nextNodes = [];
                currentNodes.forEach(node => {
                    const folders = node.querySelectorAll('Folder > name');
                    folders.forEach(folderNameNode => {
                        if (folderNameNode.textContent.trim() === part) {
                            nextNodes.push(folderNameNode.parentNode);
                        }
                    });
                });
                currentNodes = nextNodes;
                if (currentNodes.length === 0 && i < pathParts.length - 1) return; // Path not found
            }

            currentNodes.forEach(folderNode => {
                const pmElements = folderNode.querySelectorAll('Placemark');
                pmElements.forEach(pm => {
                    const name = pm.querySelector('name')?.textContent.trim() || '';
                    const coordinatesStr = pm.querySelector('Polygon outerBoundaryIs LinearRing coordinates')?.textContent.trim() || '';

                    let coordinates = [];
                    if (coordinatesStr) {
                        coordinates = coordinatesStr.split(' ').map(coordPair => {
                            const [lon, lat, alt] = coordPair.split(',').map(Number);
                            return { lon, lat, alt };
                        }).filter(c => !isNaN(c.lon) && !isNaN(c.lat));
                    }

                    polygons.push({
                        name,
                        coordinates,
                        originalElement: pm.cloneNode(true)
                    });
                });
            });
        });
        return polygons;
    }

    function processKml(regularKmlString, smallAlleyKmlString, idArea, updateProgressCallback) {
        const regularDoc = parseKml(regularKmlString);
        const smallAlleyDoc = parseKml(smallAlleyKmlString);

        updateProgressCallback(0, 'Mengekstrak data dari KML...');
        // Extract data
        const smallAlleyHps = getPlacemarks(smallAlleyDoc, ['DISTRIBUSI/HP']);
        const regularHps = getPlacemarks(regularDoc, ['DISTRIBUSI/HP']);
        const hooks = getPlacemarks(regularDoc, ['DISTRIBUSI/HOOK']);
        const fatBoundaries = getPolygons(smallAlleyDoc, ['Boundary/BOUNDARY FAT']);
        updateProgressCallback(10, `Ditemukan ${smallAlleyHps.length} HP Small Alley, ${regularHps.length} HP Reguler, ${hooks.length} HOOK, dan ${fatBoundaries.length} Boundary FAT.`);

        // Initialize new KML Document
        const newKmlDoc = document.implementation.createDocument(null, 'kml', null);
        const kmlElement = newKmlDoc.documentElement;
        kmlElement.setAttribute('xmlns', 'http://www.opengis.net/kml/2.2');
        kmlElement.setAttribute('xmlns:gx', 'http://www.google.com/kml/ext/2.2');
        kmlElement.setAttribute('xmlns:kml', 'http://www.opengis.net/kml/2.2');
        kmlElement.setAttribute('xmlns:atom', 'http://www.w3.org/2005/Atom');

        const documentElement = newKmlDoc.createElement('Document');
        kmlElement.appendChild(documentElement);

        updateProgressCallback(20, 'Menambahkan skema dan gaya KML...');

        // Add Schema for HOME and HOOK
        const schemaHome = newKmlDoc.createElement('Schema');
        schemaHome.setAttribute('name', 'HOME');
        schemaHome.setAttribute('id', 'HOME');
        const simpleFieldsHome = [
            { name: 'HOME_ID', type: 'string' },
            { name: 'CLUSTER_NAME', type: 'string' },
            { name: 'BLOCK', type: 'string' },
            { name: 'FLOOR', type: 'string' },
            { name: 'RT', type: 'string' },
            { name: 'RW', type: 'string' },
            { name: 'DISTRICT', type: 'string' },
            { name: 'SUB_DISTRICT', type: 'string' },
            { name: 'FDT_CODE', type: 'string' },
            { name: 'FAT_CODE', type: 'string' },
            { name: 'POST_CODE', type: 'string' },
            { name: 'ADDRESS_POLE___FAT', type: 'string' },
            { name: 'BUILDING_NAME', type: 'string' },
            { name: 'TOWER', type: 'string' },
            { name: 'APTN', type: 'string' },
            { name: 'FIBER_NODE__HFC_', type: 'string' },
            { name: 'Clamp_Hook_ID', type: 'string' },
            { name: 'Category_BizPass', type: 'string' },
            { name: 'HOUSE_COMMENT_', type: 'string' }
        ];
        simpleFieldsHome.forEach(field => {
            const simpleField = newKmlDoc.createElement('SimpleField');
            simpleField.setAttribute('name', field.name);
            simpleField.setAttribute('type', field.type);
            schemaHome.appendChild(simpleField);
        });
        documentElement.appendChild(schemaHome);

        const schemaHook = newKmlDoc.createElement('Schema');
        schemaHook.setAttribute('name', 'HOOK');
        schemaHook.setAttribute('id', 'HOOK');
        const simpleFieldsHook = [
            { name: 'ID', type: 'string' },
            { name: 'Lat', type: 'double' },
            { name: 'Long', type: 'double' }
        ];
        simpleFieldsHook.forEach(field => {
            const simpleField = newKmlDoc.createElement('SimpleField');
            simpleField.setAttribute('name', field.name);
            simpleField.setAttribute('type', field.type);
            schemaHook.appendChild(simpleField);
        });
        documentElement.appendChild(schemaHook);

        // Add Styles and StyleMaps
        // Style for default placemarks (red pin)
        const style1 = newKmlDoc.createElement('Style');
        style1.setAttribute('id', 'default_style');
        const iconStyle1 = newKmlDoc.createElement('IconStyle');
        const icon1 = newKmlDoc.createElement('Icon');
        icon1.textContent = 'http://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png'; // Specific icon
        iconStyle1.appendChild(icon1);
        style1.appendChild(iconStyle1);
        documentElement.appendChild(style1);

        // Style for 'HOME' (white pin)
        const styleHome = newKmlDoc.createElement('Style');
        styleHome.setAttribute('id', 'HOME_STYLE');
        const iconStyleHome = newKmlDoc.createElement('IconStyle');
        const iconHome = newKmlDoc.createElement('Icon');
        iconHome.textContent = 'http://maps.google.com/mapfiles/kml/paddle/wht-blank.png'; // Specific icon
        iconStyleHome.appendChild(iconHome);
        styleHome.appendChild(iconStyleHome);
        documentElement.appendChild(styleHome);

        // Style for 'HOOK' (blue pin)
        const styleHook = newKmlDoc.createElement('Style');
        styleHook.setAttribute('id', 'HOOK_STYLE');
        const iconStyleHook = newKmlDoc.createElement('IconStyle');
        const iconHook = newKmlDoc.createElement('Icon');
        iconHook.textContent = 'http://maps.google.com/mapfiles/kml/paddle/blu-circle.png'; // Specific icon
        iconStyleHook.appendChild(iconHook);
        styleHook.appendChild(iconStyleHook);
        documentElement.appendChild(styleHook);


        updateProgressCallback(30, 'Membuat struktur folder KML...');
        // Create initial folder structure
        const distribusifolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, distribusifolder, 'DISTRIBUSI');
        documentElement.appendChild(distribusifolder);

        const hpFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, hpFolder, 'HP');
        distribusifolder.appendChild(hpFolder);

        const homeFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, homeFolder, 'HOME');
        hpFolder.appendChild(homeFolder);

        const homeBizFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, homeBizFolder, 'HOME-BIZ');
        hpFolder.appendChild(homeBizFolder);

        const poleFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, poleFolder, 'POLE');
        distribusifolder.appendChild(poleFolder);

        const fdtFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, fdtFolder, 'FDT');
        distribusifolder.appendChild(fdtFolder);

        const fatFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, fatFolder, 'FAT');
        distribusifolder.appendChild(fatFolder);

        const cableDistributionFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, cableDistributionFolder, 'CABLE DISTRIBUTION');
        distribusifolder.appendChild(cableDistributionFolder);

        const cableDropFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, cableDropFolder, 'CABLE DROP');
        distribusifolder.appendChild(cableDropFolder);

        const slingWireFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, slingWireFolder, 'SLING WIRE');
        distribusifolder.appendChild(slingWireFolder);

        const hookFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, hookFolder, 'HOOK');
        distribusifolder.appendChild(hookFolder);

        const boundaryFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, boundaryFolder, 'Boundary');
        documentElement.appendChild(boundaryFolder);

        const boundaryFatFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, boundaryFatFolder, 'BOUNDARY FAT');
        boundaryFolder.appendChild(boundaryFatFolder);

        const qspanFolder = newKmlDoc.createElement('Folder');
        addNameToFolder(newKmlDoc, qspanFolder, 'QSPAN');
        documentElement.appendChild(qspanFolder);

        updateProgressCallback(40, `Memproses ${smallAlleyHps.length} HP Small Alley...`);
        // Process Small Alley HPs
        smallAlleyHps.forEach((hp, index) => {
            if (index % 100 === 0) { // Update every 100 HPs for performance
                updateProgressCallback(40 + (index / smallAlleyHps.length) * 40, `Memproses HP Small Alley: ${index + 1}/${smallAlleyHps.length}`);
            }

            const newPm = newKmlDoc.createElement('Placemark');
            const nameElement = newKmlDoc.createElement('name');
            nameElement.textContent = hp.name;
            newPm.appendChild(nameElement);

            const styleUrl = newKmlDoc.createElement('styleUrl');
            styleUrl.textContent = '#HOME_STYLE';
            newPm.appendChild(styleUrl);

            const pointElement = newKmlDoc.createElement('Point');
            const coordinatesElement = newKmlDoc.createElement('coordinates');
            coordinatesElement.textContent = `${hp.coordinates[0].lon},${hp.coordinates[0].lat},0`;
            pointElement.appendChild(coordinatesElement);
            newPm.appendChild(pointElement);

            const extendedDataElement = newKmlDoc.createElement('ExtendedData');
            const schemaDataElement = newKmlDoc.createElement('SchemaData');
            schemaDataElement.setAttribute('schemaUrl', '#HOME');
            extendedDataElement.appendChild(schemaDataElement);

            // Initialize with default values
            const newExtendedData = {
                HOME_ID: '',
                CLUSTER_NAME: '',
                BLOCK: '',
                FLOOR: '',
                RT: '',
                RW: '',
                DISTRICT: '',
                SUB_DISTRICT: '',
                FDT_CODE: '',
                FAT_CODE: '', // This will be determined later
                POST_CODE: '',
                ADDRESS_POLE___FAT: '',
                BUILDING_NAME: '',
                TOWER: '',
                APTN: '',
                FIBER_NODE__HFC_: '',
                Clamp_Hook_ID: '', // This will be determined later
                Category_BizPass: '',
                HOUSE_COMMENT_: '' // This will be determined later
            };

            // Find closest regular HP to inherit data
            let closestRegularHp = null;
            let minDistance = Infinity;
            if (hp.coordinates.length > 0) {
                const hpLat = hp.coordinates[0].lat;
                const hpLon = hp.coordinates[0].lon;

                regularHps.forEach(regHp => {
                    if (regHp.coordinates.length > 0) {
                        const regHpLat = regHp.coordinates[0].lat;
                        const regHpLon = regHp.coordinates[0].lon;
                        const dist = haversineDistance(hpLat, hpLon, regHpLat, regHpLon);
                        if (dist < minDistance) {
                            minDistance = dist;
                            closestRegularHp = regHp;
                        }
                    }
                });
            }

            if (closestRegularHp) {
                // Inherit values from closest regular HP
                newExtendedData.HOME_ID = closestRegularHp.extendedData.HOME_ID || '';

                // LOGIC CHANGE: Remove "DESA" from CLUSTER_NAME
                let clusterName = closestRegularHp.extendedData.CLUSTER_NAME || '';
                if (clusterName.toUpperCase().includes('DESA ')) {
                    clusterName = clusterName.toUpperCase().replace('DESA ', '').trim();
                }
                newExtendedData.CLUSTER_NAME = clusterName;
                // END LOGIC CHANGE

                newExtendedData.BLOCK = closestRegularHp.extendedData.BLOCK || '';
                newExtendedData.FLOOR = closestRegularHp.extendedData.FLOOR || '';
                newExtendedData.RT = closestRegularHp.extendedData.RT || '';
                newExtendedData.RW = closestRegularHp.extendedData.RW || '';
                newExtendedData.DISTRICT = closestRegularHp.extendedData.DISTRICT || '';
                newExtendedData.SUB_DISTRICT = closestRegularHp.extendedData.SUB_DISTRICT || '';
                newExtendedData.FDT_CODE = closestRegularHp.extendedData.FDT_CODE || '';
                newExtendedData.POST_CODE = closestRegularHp.extendedData.POST_CODE || '';
                newExtendedData.ADDRESS_POLE___FAT = closestRegularHp.extendedData.ADDRESS_POLE___FAT || '';
                newExtendedData.BUILDING_NAME = closestRegularHp.extendedData.BUILDING_NAME || '';
                newExtendedData.TOWER = closestRegularHp.extendedData.TOWER || '';
                newExtendedData.APTN = closestRegularHp.extendedData.APTN || '';
                newExtendedData.FIBER_NODE__HFC_ = closestRegularHp.extendedData.FIBER_NODE__HFC_ || '';

                if (closestRegularHp.extendedData.Category_BizPass === 'BUSINESS') {
                    newExtendedData.Category_BizPass = 'BUSINESS';
                }
            }

            // Determine FAT_CODE based on point in polygon
            let foundFat = false;
            if (hp.coordinates.length > 0) {
                const hpLat = hp.coordinates[0].lat;
                const hpLon = hp.coordinates[0].lon;
                for (const fatBoundary of fatBoundaries) {
                    if (fatBoundary.coordinates.length > 0) {
                        // KML coordinates are (lon, lat, alt), so convert to (lat, lon) for pointInPolygon
                        const polygonCoords = fatBoundary.coordinates.map(c => ({ lat: c.lat, lon: c.lon }));
                        if (pointInPolygon({ lat: hpLat, lon: hpLon }, polygonCoords)) {
                            newExtendedData.FAT_CODE = fatBoundary.name;
                            foundFat = true;
                            break;
                        }
                    }
                }
            }
            if (!foundFat) {
                newExtendedData.FAT_CODE = ''; // Or some other default if not found in any FAT boundary
            }


            // Determine Clamp_Hook_ID and HOUSE_COMMENT_
            let closestHook = null;
            let minHookDistance = Infinity;
            if (hp.coordinates.length > 0) {
                const hpLat = hp.coordinates[0].lat;
                const hpLon = hp.coordinates[0].lon;

                hooks.forEach(hook => {
                    if (hook.coordinates.length > 0) {
                        const hookLat = hook.coordinates[0].lat;
                        const hookLon = hook.coordinates[0].lon;
                        const dist = haversineDistance(hpLat, hpLon, hookLat, hookLon);
                        if (dist < minHookDistance) {
                            minHookDistance = dist;
                            closestHook = hook;
                        }
                    }
                });
            }

            if (closestHook && minHookDistance <= 50) { // If within 50 meters
                newExtendedData.Clamp_Hook_ID = closestHook.name;
                newExtendedData.HOUSE_COMMENT_ = 'NEED SURVEY';
            }


            // Append SimpleData to SchemaData
            for (const key in newExtendedData) {
                if (newExtendedData.hasOwnProperty(key)) {
                    const simpleDataElement = newKmlDoc.createElement('SimpleData');
                    simpleDataElement.setAttribute('name', key);
                    simpleDataElement.textContent = newExtendedData[key];
                    schemaDataElement.appendChild(simpleDataElement);
                }
            }

            newPm.appendChild(extendedDataElement);

            if (newExtendedData.Category_BizPass === 'BUSINESS') {
                homeBizFolder.appendChild(newPm);
            } else {
                homeFolder.appendChild(newPm);
            }
        });
        updateProgressCallback(80, 'Memproses data HOOK dan menyalin elemen lainnya...');


        // Add Hook data from regularKmz to the new KML
        hooks.forEach(hook => {
            const newPm = newKmlDoc.createElement('Placemark');
            const nameElement = newKmlDoc.createElement('name');
            nameElement.textContent = hook.name;
            newPm.appendChild(nameElement);

            const styleUrl = newKmlDoc.createElement('styleUrl');
            styleUrl.textContent = '#HOOK_STYLE';
            newPm.appendChild(styleUrl);

            const pointElement = newKmlDoc.createElement('Point');
            const coordinatesElement = newKmlDoc.createElement('coordinates');
            coordinatesElement.textContent = `${hook.coordinates[0].lon},${hook.coordinates[0].lat},0`;
            pointElement.appendChild(coordinatesElement);
            newPm.appendChild(pointElement);

            const extendedDataElement = newKmlDoc.createElement('ExtendedData');
            const schemaDataElement = newKmlDoc.createElement('SchemaData');
            schemaDataElement.setAttribute('schemaUrl', '#HOOK');
            extendedDataElement.appendChild(schemaDataElement);

            // Add Hook ID, Lat, Long to ExtendedData
            const hookIdData = newKmlDoc.createElement('SimpleData');
            hookIdData.setAttribute('name', 'ID');
            hookIdData.textContent = hook.name;
            schemaDataElement.appendChild(hookIdData);

            const hookLatData = newKmlDoc.createElement('SimpleData');
            hookLatData.setAttribute('name', 'Lat');
            hookLatData.textContent = hook.coordinates[0].lat;
            schemaDataElement.appendChild(hookLatData);

            const hookLongData = newKmlDoc.createElement('SimpleData');
            hookLongData.setAttribute('name', 'Long');
            hookLongData.textContent = hook.coordinates[0].lon;
            schemaDataElement.appendChild(hookLongData);

            newPm.appendChild(extendedDataElement);
            hookFolder.appendChild(newPm);
        });

        // Copy other elements from regularDoc to newKmlDoc (POLE, FDT, FAT, CABLE DISTRIBUTION, CABLE DROP, SLING WIRE, QSPAN)
        const regularDocPathsToCopy = [
            'DISTRIBUSI/POLE',
            'DISTRIBUSI/FDT',
            'DISTRIBUSI/FAT',
            'DISTRIBUSI/CABLE DISTRIBUTION',
            'DISTRIBUSI/CABLE DROP',
            'DISTRIBUSI/SLING WIRE',
            'QSPAN'
        ];

        regularDocPathsToCopy.forEach(path => {
            const parts = path.split('/');
            let currentSourceNodes = [regularDoc];
            let currentDestNode = newKmlDoc.documentElement;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const nextSourceNodes = [];
                let nextDestNode = null;

                // Find the corresponding destination folder
                const destFolders = currentDestNode.querySelectorAll('Folder > name');
                for (const destFolder of destFolders) {
                    if (destFolder.textContent.trim() === part) {
                        nextDestNode = destFolder.parentNode;
                        break;
                    }
                }
                if (!nextDestNode) {
                    console.warn(`Destination folder ${part} not found for path ${path}`);
                    return;
                }

                currentSourceNodes.forEach(sourceNode => {
                    const folders = sourceNode.querySelectorAll('Folder > name');
                    folders.forEach(folderNameNode => {
                        if (folderNameNode.textContent.trim() === part) {
                            nextSourceNodes.push(folderNameNode.parentNode);
                        }
                    });
                });
                currentSourceNodes = nextSourceNodes;
                currentDestNode = nextDestNode;

                if (currentSourceNodes.length === 0 && i < parts.length - 1) return; // Source path not found
            }

            currentSourceNodes.forEach(sourceFolder => {
                Array.from(sourceFolder.children).forEach(child => {
                    if (child.nodeName !== 'name') {
                        currentDestNode.appendChild(newKmlDoc.importNode(child, true));
                    }
                });
            });
        });

        // Copy BOUNDARY FAT from smallAlleyDoc
        const smallAlleyFatBoundariesFolder = smallAlleyDoc.querySelector('Folder > name')
                                              ? Array.from(smallAlleyDoc.querySelectorAll('Folder > name'))
                                                  .find(n => n.textContent.trim() === 'BOUNDARY FAT')?.parentNode
                                              : null;

        if (smallAlleyFatBoundariesFolder) {
            const targetBoundaryFatFolder = newKmlDoc.querySelector('Folder > name')
                                            ? Array.from(newKmlDoc.querySelectorAll('Folder > name'))
                                                .find(n => n.textContent.trim() === 'BOUNDARY FAT')?.parentNode
                                            : null;

            if (targetBoundaryFatFolder) {
                Array.from(smallAlleyFatBoundariesFolder.children).forEach(child => {
                    if (child.nodeName !== 'name') {
                        targetBoundaryFatFolder.appendChild(newKmlDoc.importNode(child, true));
                    }
                });
            }
        }

        const serializer = new XMLSerializer();
        updateProgressCallback(100, 'Serialisasi KML selesai.');
        return serializer.serializeToString(newKmlDoc);
    }

    // Helper function to add name element to a folder
    function addNameToFolder(doc, folderElement, nameText) {
        const nameNode = doc.createElement('name');
        nameNode.textContent = nameText;
        folderElement.appendChild(nameNode);
    }

    // Haversine distance function
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const d = R * c; // in metres
        return d;
    }

    // Point in polygon algorithm (Ray casting)
    function pointInPolygon(point, polygon) {
        const x = point.lon, y = point.lat;

        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lon, yi = polygon[i].lat;
            const xj = polygon[j].lon, yj = polygon[j].lat;

            const intersect = ((yi > y) !== (yj > y)) &&
                             (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // Handle download link click for cleanup
    downloadLink.addEventListener('click', () => {
        if (processedKmzBlob) {
            URL.revokeObjectURL(downloadLink.href); // Clean up the object URL
            processedKmzBlob = null; // Clear the blob
            downloadLink.href = '#'; // Reset href
        }
    });
});
