---
title: Kubernetes in Action
weight: 2
---

# Book: Kubernetes in Action

## Chapter 1

### Difference between Virtual Machines and Containers

Using VMs to isolate groups of applications vs. isolating individual apps with containers:

When you run three VMs on a host, you have three completely separate operating systems running on and sharing the same bare-metal hardware. Underneath those VMs is the host’s OS and a hypervisor, which divides the physical hardware resources into smaller sets of virtual resources that can be used by the operating system inside each VM. Applications running inside those VMs perform system calls to the guest OS’ kernel in the VM, and the kernel then performs x86 instructions on the host’s physical CPU through the hypervisor.

Note: Two types of hypervisors exist. Type 1 hypervisors don’t use a host OS, while Type 2 do.

**Containers**, on the other hand, all perform system calls on the exact same kernel running in the host OS. This single kernel is the only one performing x86 instructions on the host’s CPU. The CPU doesn’t need to do any kind of virtualization the way it does with VMs.

The main benefit of virtual machines is the full isolation they provide, because each VM runs its own Linux kernel, while containers all call out to the same kernel, which can clearly pose a security risk. If you have a limited amount of hardware resources, VMs may only be an option when you have a small number of processes that you want to isolate. To run greater numbers of isolated processes on the same machine, containers are a much better choice because of their low overhead. Remember, each VM runs its own set of system services, while containers don’t, because they all run in the same OS. That also means that to run a container, nothing needs to be booted up, as is the case in VMs. A process run in a container starts up immediately.


What mechanisms make container isolation possible?
 - Linux Namespaces. Each process sees its own personal view of the system (files, processes, network interfaces, hostnames)
 - Linux Control Groups (cgroups). Limit the amount of resources the process can consumer (CPU, memory, network bandwidh)

### Introducing the Docker container platform

While container technologies have been around for a long time, they’ve become more widely known with the rise of the Docker container platform. Docker was the first container system that made containers easily portable across different machines. It simplified the process of packaging up not only the application but also all its libraries and other dependencies, even the whole OS file system, into a simple, portable package that can be used to provision the application to any other machine running Docker.

When you run an application packaged with Docker, it sees the exact filesystem contents that you’ve bundled with it. It sees the same files whether it’s running on your development machine or a production machine, even if it the production server is running a completely different Linux OS.

This is similar to creating a VM image by installing an operating system into a VM, installing the app inside it, and then distributing the whole VM image around and running it. Docker achieves the same effect, but instead of using VMs to achieve app isolation, it uses Linux container technologies mentioned in the previous section to provide (almost) the same level of isolation that VMs do. Instead of using big monolithic VM images, it uses container images, which are usually smaller.

Three main concepts in Docker comprise this scenario:

Images—A Docker-based container image is something you package your application and its environment into. It contains the filesystem that will be available to the application and other metadata, such as the path to the executable that should be executed when the image is run.
Registries—A Docker Registry is a repository that stores your Docker images and facilitates easy sharing of those images between different people and computers. When you build your image, you can either run it on the computer you’ve built it on, or you can push (upload) the image to a registry and then pull (download) it on another computer and run it there. Certain registries are public, allowing anyone to pull images from it, while others are private, only accessible to certain people or machines.
Containers—A Docker-based container is a regular Linux container created from a Docker-based container image. A running container is a process running on the host running Docker, but it’s completely isolated from both the host and all other processes running on it. The process is also resource-constrained, meaning it can only access and use the amount of resources (CPU, RAM, and so on) that are allocated to it.


Docker was the first container platform that made containers mainstream. I hope I’ve made it clear that Docker itself doesn’t provide process isolation. The actual isolation of containers is done at the Linux kernel level using kernel features such as Linux Namespaces and cgroups. Docker only makes it easy to use those features.

This book focuses on using Docker as the container runtime for Kubernetes, because it was initially the only one supported by Kubernetes. Recently, Kubernetes has also started supporting rkt, as well as others, as the container runtime.

Like Docker, rkt is a platform for running containers. It puts a strong emphasis on security, composability, and conforming to open standards. It uses the OCI container image format and can even run regular Docker container images.

In fact, over the course of this book, you’ll realize that the essence of Kubernetes isn’t orchestrating containers. It’s much more. Containers happen to be the best way to run apps on different cluster nodes.


## Kubernetes

Kubernetes is a software system that allows you to easily deploy and manage containerized applications on top of it. It relies on the features of Linux containers to run heterogeneous applications without having to know any internal details of these applications and without having to manually deploy these applications on each host. Because these apps run in containers, they don’t affect other apps running on the same server, which is critical when you run applications for completely different organizations on the same hardware.

Deploying applications through Kubernetes is always the same, whether your cluster contains only a couple of nodes or thousands of them. The size of the cluster makes no difference at all. Additional cluster nodes simply represent an additional amount of resources available to deployed apps.

Figure 1.8 shows the simplest possible view of a Kubernetes system. The system is composed of a master node and any number of worker nodes. When the developer submits a list of apps to the master, Kubernetes deploys them to the cluster of worker nodes. What node a component lands on doesn’t (and shouldn’t) matter—neither to the developer nor to the system administrator.
The developer can specify that certain apps must run together and Kubernetes will deploy them on the same worker node. Others will be spread around the cluster, but they can talk to each other in the same way, regardless of where they’re deployed.

Kubernetes helps developers focus on the Core App Features:
Kubernetes can be thought of as an operating system for the cluster. It relieves application developers from having to implement certain infrastructure-related services into their apps; instead they rely on Kubernetes to provide these services. This includes things such as service discovery, scaling, load-balancing, self-healing, and even leader election. Application developers can therefore focus on implementing the actual features of the applications and not waste time figuring out how to integrate them with the infrastructure.


At the hardware level, a Kubernetes cluster is composed of many nodes, which can be split into two types:

The master node, which hosts the Kubernetes Control Plane that controls and manages the whole Kubernetes system
Worker nodes that run the actual applications you deploy

The components of the Control Plane hold and control the state of the cluster, but they don’t run your applications. This is done by the (worker) nodes.
It consists of multiple components that can run on a single master node or be split across multiple nodes and replicated to ensure high availability. These components are:
- The Kubernetes API Server, which you and the other Control Plane components communicate with
- The Scheduler, which schedules your apps (assigns a worker node to each deployable component of your application)
- The Controller Manager, which performs cluster-level functions, such as replicating components, keeping track of worker nodes, handling node failures, and so on
- etcd, a reliable distributed data store that persistently stores the cluster configuration.

### Summary

Monolithic apps are easier to deploy, but harder to maintain over time and sometimes impossible to scale.
Microservices-based application architectures allow easier development of each component, but are harder to deploy and configure to work as a single system.
Linux containers provide much the same benefits as virtual machines, but are far more lightweight and allow for much better hardware utilization.
Docker improved on existing Linux container technologies by allowing easier and faster provisioning of containerized apps together with their OS environments.
Kubernetes exposes the whole datacenter as a single computational resource for running applications.
Developers can deploy apps through Kubernetes without assistance from sysadmins.
Sysadmins can sleep better by having Kubernetes deal with failed nodes automatically.
In the next chapter, you’ll get your hands dirty by building an app and running it in Docker and then in Kubernetes.


## Chapter 2. First steps with Docker and Kubernetes

### 2.2.1. Running a local single-node Kubernetes cluster with Minikube

Minikube -> Minikube is a tool that sets up a single-node cluster that’s great for both testing Kubernetes and developing apps locally.

-> brew install Minikube
-> kubectl cluster-info

You can run minikube ssh to log into the Minikube VM and explore it from the inside. For example, you may want to see what processes are running on the node.

What is a worker node?
In Kubernetes, a worker node is a machine that runs containerized applications. It is a part of the Kubernetes cluster and is managed by the master node.
The worker node runs the Kubernetes kubelet, which is an agent that communicates with the master node and is responsible for managing the pods on the worker node. The worker node also runs a container runtime, such as Docker, to execute the containers in the pods.
Worker nodes are used to run the applications and services that make up the workload of the Kubernetes cluster. They are where the containers are actually deployed and run.
The worker nodes are managed by the master node, which is responsible for scheduling pods on the worker nodes and ensuring that the desired state of the cluster is maintained. The master node also exposes the Kubernetes API, which is used by developers and system administrators to deploy and manage applications on the cluster.

What is a pod?
A pod is a group of one or more tightly related containers that will always run together on the same worker node and in the same Linux namespace(s). Each pod is like a separate logical machine with its own IP, hostname, processes, and so on, running a single application. The application can be a single process, running in a single container, or it can be a main application process and additional supporting processes, each running in its own container. All the containers in a pod will appear to be running on the same logical machine, whereas containers in other pods, even if they’re running on the same worker node, will appear to be running on a different one.

notes: The term scheduling means assigning the pod to a node. The pod is run immediately, not at a time in the future as the term might lead you to believe.


What are services?
When a service is created, it gets a static IP, which never changes during the lifetime of the service. Instead of connecting to pods directly, clients should connect to the service through its constant IP address. The service makes sure one of the pods receives the connection, regardless of where the pod is currently running (and what its IP address is).
Services represent a static location for a group of one or more pods that all provide the same service. Requests coming to the IP and port of the service will be forwarded to the IP and port of one of the pods belonging to the service at that moment.



